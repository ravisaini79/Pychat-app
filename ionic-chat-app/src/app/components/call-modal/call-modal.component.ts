import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonFabButton, 
  IonIcon, 
  IonButton,
  ModalController 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  call, 
  callOutline, 
  videocam, 
  videocamOutline, 
  mic, 
  micOff, 
  volumeHigh, 
  volumeMute, 
  close,
  cameraReverse
} from 'ionicons/icons';
import { ChatService } from '../../services/chat.service';
import { CallService, CallState } from '../../services/call.service';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-call-modal',
  templateUrl: './call-modal.component.html',
  styleUrls: ['./call-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    AvatarComponent,
    IonFabButton,
    IonIcon,
    IonButton
  ]
})
export class CallModalComponent implements OnInit, OnDestroy {
  @Input() isIncoming = false;
  @Input() targetUserId: string = '';
  @Input() type: 'audio' | 'video' = 'audio';
  @Input() callId?: string;

  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;

  targetUser: any = null;
  callState: CallState = 'idle';
  isMuted = false;
  isSpeakerOn = false;
  isCameraOff = false;
  timer = '00:00';
  private timerInterval: any;

  constructor(
    private modalCtrl: ModalController,
    private chatService: ChatService,
    private callService: CallService
  ) {
    addIcons({ 
      call, callOutline, videocam, videocamOutline, 
      mic, micOff, volumeHigh, volumeMute, close, cameraReverse 
    });
  }

  ngOnInit() {
    this.loadTargetUser();
    this.callService.callState$.subscribe(state => {
      this.callState = state;
      if (state === 'connected') this.startTimer();
      if (state === 'ended' || state === 'idle') this.dismiss();
    });

    // Attach remote stream when available
    this.callService.getRemoteStream().subscribe(stream => {
      if (stream && this.remoteVideo) {
        this.remoteVideo.nativeElement.srcObject = stream;
      }
    });

    // Attach local stream immediately for video calls
    setTimeout(() => {
      const localStream = this.callService.getLocalStream();
      if (localStream && this.localVideo && this.type === 'video') {
        this.localVideo.nativeElement.srcObject = localStream;
      }
    }, 500);
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  loadTargetUser() {
    this.chatService.getUserProfile(this.targetUserId).subscribe(user => {
      this.targetUser = user;
    });
  }

  startTimer() {
    let seconds = 0;
    this.timerInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.timer = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  accept() {
    if (this.callId) {
      this.callService.acceptCall(this.callId, this.targetUserId, this.type);
    }
  }

  reject() {
    if (this.callId) {
      this.callService.rejectCall(this.callId, this.targetUserId);
    }
  }

  hangup() {
    this.callService.hangup();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const stream = this.callService.getLocalStream();
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    }
  }

  toggleSpeaker() {
    this.isSpeakerOn = !this.isSpeakerOn;
    // In a real browser/device, this might involve sinking the audio output
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    const stream = this.callService.getLocalStream();
    if (stream) {
      stream.getVideoTracks().forEach(t => t.enabled = !this.isCameraOff);
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
