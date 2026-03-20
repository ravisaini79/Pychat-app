import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ChatService } from './chat.service';
import { AuthService } from './auth.service';
import { CallModalComponent } from '../components/call-modal/call-modal.component';

export type CallState = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream = new BehaviorSubject<MediaStream | null>(null);
  
  private _callState = new BehaviorSubject<CallState>('idle');
  public callState$ = this._callState.asObservable();
  
  private currentCallId: string | null = null;
  private targetUserId: string | null = null;
  private isAudioOnly = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private modalCtrl: ModalController
  ) {
    this.setupSignaling();
  }

  private setupSignaling() {
    this.chatService.messages$.subscribe(msg => {
      switch (msg.event) {
        case 'call_incoming':
          this.handleIncomingCall(msg);
          break;
        case 'call_response':
          this.handleCallResponse(msg);
          break;
        case 'call_hangup':
          this.handleHangup(msg);
          break;
        case 'webrtc_signal':
          this.handleWebRTCSignal(msg);
          break;
      }
    });
  }

  // --- External API ---

  async initiateCall(targetUserId: string, type: 'audio' | 'video') {
    this.targetUserId = targetUserId;
    this.isAudioOnly = type === 'audio';
    this._callState.next('dialing');

    // Show Call UI
    const modal = await this.modalCtrl.create({
      component: CallModalComponent,
      componentProps: { 
        isIncoming: false,
        targetUserId: targetUserId,
        type: type
      },
      cssClass: 'call-modal'
    });
    await modal.present();

    // Notify backend
    this.chatService.sendSignal({
      event: 'call_initiate',
      to: targetUserId,
      type: type
    });
  }

  async acceptCall(callId: string, fromUserId: string, type: 'audio' | 'video') {
    this.currentCallId = callId;
    this.targetUserId = fromUserId;
    this.isAudioOnly = type === 'audio';
    
    this.chatService.sendSignal({
      event: 'call_response',
      to: fromUserId,
      call_id: callId,
      response: 'accepted'
    });

    await this.setupWebRTC(true); // Answerer
  }

  rejectCall(callId: string, fromUserId: string, reason: 'rejected' | 'busy' = 'rejected') {
    this.chatService.sendSignal({
      event: 'call_response',
      to: fromUserId,
      call_id: callId,
      response: reason
    });
    this.endCallLocally();
  }

  hangup() {
    if (this.targetUserId && this.currentCallId) {
      this.chatService.sendSignal({
        event: 'call_hangup',
        to: this.targetUserId,
        call_id: this.currentCallId
      });
    }
    this.endCallLocally();
  }

  // --- Internal State Management ---

  private async handleIncomingCall(msg: any) {
    if (this._callState.value !== 'idle') {
      this.rejectCall(msg.call_id, msg.from, 'busy');
      return;
    }

    this.currentCallId = msg.call_id;
    this.targetUserId = msg.from;
    this.isAudioOnly = msg.type === 'audio';
    this._callState.next('ringing');

    // Show Incoming Call Screen
    const modal = await this.modalCtrl.create({
      component: CallModalComponent,
      componentProps: { 
        isIncoming: true,
        targetUserId: msg.from,
        type: msg.type,
        callId: msg.call_id
      },
      cssClass: 'call-modal'
    });
    await modal.present();
  }

  private async handleCallResponse(msg: any) {
    if (msg.response === 'accepted') {
      this.currentCallId = msg.call_id;
      this._callState.next('connected');
      await this.setupWebRTC(false); // Offerer
    } else {
      this.endCallLocally();
    }
  }

  private handleHangup(msg: any) {
    this.endCallLocally();
  }

  private async setupWebRTC(isAnswerer: boolean) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: !this.isAudioOnly
      });

      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });

      this.peerConnection.ontrack = (event) => {
        this.remoteStream.next(event.streams[0]);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.chatService.sendSignal({
            event: 'webrtc_signal',
            to: this.targetUserId,
            signal: { type: 'ice', candidate: event.candidate }
          });
        }
      };

      if (!isAnswerer) {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.chatService.sendSignal({
          event: 'webrtc_signal',
          to: this.targetUserId,
          signal: offer
        });
      }
    } catch (e) {
      console.error('WebRTC Setup Error:', e);
      this.hangup();
    }
  }

  private async handleWebRTCSignal(msg: any) {
    if (!this.peerConnection) return;
    const { signal } = msg;

    if (signal.type === 'offer') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.chatService.sendSignal({
        event: 'webrtc_signal',
        to: this.targetUserId,
        signal: answer
      });
    } else if (signal.type === 'answer') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.type === 'ice') {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }

  private endCallLocally() {
    this.stopMedia();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this._callState.next('idle');
    this.currentCallId = null;
    this.targetUserId = null;
    this.remoteStream.next(null);
    this.modalCtrl.dismiss();
  }

  private stopMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  public getRemoteStream() {
    return this.remoteStream.asObservable();
  }

  public getLocalStream() {
    return this.localStream;
  }
}
