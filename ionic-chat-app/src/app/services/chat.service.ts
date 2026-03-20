import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AlertController } from '@ionic/angular/standalone';

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private socket: WebSocket | null = null;
  private _messages = new Subject<any>();
  private _onlineUsers = new BehaviorSubject<string[]>([]);
  public activeChatId: string | null = null;
  
  private reconnectInterval: any;
  private pingInterval: any;
  private reconnectAttempts = 0;
  private currentToken: string | null = null;
  private manualDisconnect = false;

  constructor(
    private http: HttpClient, 
    private authService: AuthService,
    private alertCtrl: AlertController
  ) {
    this.authService.token$.subscribe(token => {
      if (token) {
        this.connect(token);
      } else {
        this.disconnect();
      }
    });
  }

  private connect(token: string) {
    this.currentToken = token;
    this.manualDisconnect = false;
    const wsUrl = `${environment.wsUrl}?token=${token}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.startPing();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'pong') return; // Ignore pong
        this._messages.next(data);
        
        if (data.event === 'user_presence') {
          // Handle presence updates
        }
      } catch(e) {}
    };

    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.stopPing();
      if (!this.manualDisconnect) {
        this.attemptReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // onclose will handle reconnecting
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < 10 && this.currentToken && !this.manualDisconnect) {
      const timeout = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts));
      this.reconnectAttempts++;
      console.log(`Reconnecting in ${timeout}ms... (Attempt ${this.reconnectAttempts})`);
      this.reconnectInterval = setTimeout(() => {
        this.connect(this.currentToken!);
      }, timeout);
    }
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ event: 'ping' }));
        } catch (e) {
          console.error("Ping failed", e);
        }
      }
    }, 30000); // 30 seconds
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private disconnect() {
    this.manualDisconnect = true;
    this.stopPing();
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.currentToken = null;
  }

  get messages$(): Observable<any> {
    return this._messages.asObservable();
  }

  getContacts(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/chat/contacts`);
  }

  getMessages(userId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${environment.apiUrl}/chat/messages/${userId}`);
  }

  // Connection System
  searchUsers(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/chat/users`, {
      params: { q: query }
    });
  }

  searchUserByPhone(phone: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/chat/search-by-phone`, {
      params: { phone }
    });
  }

  getConnectionStatus(userId: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/chat/connection-status/${userId}`);
  }

  sendConnectionRequest(toUserId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/chat/connection-request`, {
      to_user_id: toUserId
    });
  }

  getConnectionRequests(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/chat/connection-requests`);
  }

  respondToRequest(requestId: string, action: 'accept' | 'reject'): Observable<any> {
    return this.http.post(`${environment.apiUrl}/chat/connection-request/${requestId}/${action}`, {});
  }

  getConversations(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/chat/conversations`);
  }

  getStatuses(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/chat/status`);
  }

  getUserProfile(userId: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/chat/user/${userId}`);
  }

  postStatus(status: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/chat/status`, status);
  }

  viewStatus(statusId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/chat/status/${statusId}/view`, {});
  }

  deleteStatus(statusId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/chat/status/${statusId}`);
  }

  getStatusViewers(statusId: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/chat/status/${statusId}/viewers`);
  }

  getCalls(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/chat/calls`);
  }

  async createAlert(opts: any) {
    return await this.alertCtrl.create(opts);
  }

  sendMessage(receiverId: string, content: string, type: string = 'text', replyToId?: string) {
    return this.http.post(`${environment.apiUrl}/chat/messages`, {
      receiver_id: receiverId,
      content: content,
      type: type,
      reply_to_id: replyToId
    });
  }

  sendGroupMessage(groupId: string, content: string, type: string = 'text', replyToId?: string) {
    return this.http.post(`${environment.apiUrl}/chat/messages`, {
      group_id: groupId,
      content: content,
      type: type,
      reply_to_id: replyToId
    });
  }

  sendSignal(signalData: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        event: 'webrtc_signal',
        ...signalData
      }));
    }
  }

  sendTypingStatus(receiverId: string, isTyping: boolean, groupId?: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        event: 'typing',
        receiver_id: receiverId,
        group_id: groupId,
        is_typing: isTyping
      }));
    }
  }

  sendMessageSeen(messageId: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        event: 'message_seen',
        message_id: messageId
      }));
    }
  }

  reactToMessage(messageId: string, emoji: string) {
    return this.http.post(`${environment.apiUrl}/chat/messages/${messageId}/react`, {}, {
      params: { emoji: emoji }
    });
  }

  // --- Multimedia Upload ---
  uploadFile(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${environment.apiUrl}/chat/upload`, formData);
  }
}
