import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { 
  IonContent, 
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonIcon,
  IonTextarea,
  IonFabButton,
  IonAvatar,
  IonFooter,
  IonButton,
  ToastController,
  ActionSheetController,
  LoadingController,
  GestureController,
  ModalController,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonItem
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  videocam, 
  call, 
  ellipsisVertical, 
  happyOutline, 
  attachOutline, 
  cameraOutline, 
  send, 
  mic,
  checkmark,
  checkmarkDone,
  lockClosedOutline,
  closeCircle,
  downloadOutline,
  happy
} from 'ionicons/icons';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { CallService } from '../../services/call.service';
import { environment } from '../../../environments/environment';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { UserProfileComponent } from '../../components/user-profile/user-profile.component';

@Component({
  selector: 'app-chat-detail',
  templateUrl: './chat-detail.page.html',
  styleUrls: ['./chat-detail.page.scss'],
  standalone: true,
  host: {
    class: 'ion-page'
  },
  imports: [
    CommonModule, 
    AvatarComponent, 
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonTextarea,
    IonFabButton,
    IonAvatar,
    IonFooter,
    IonButton,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonItem
  ]
})
export class ChatDetailPage implements OnInit {
  @ViewChild('content', { static: false }) content!: IonContent;
  @ViewChild('fileInput') fileInput: any;
  
  chatId: string = '';
  chatType: 'private' | 'group' = 'private';
  name: string = 'Chat';
  avatar: string = 'assets/default-avatar.png';
  messages: any[] = [];
  newMessage: string = '';
  userId: string = '';
  currentUserId: string = '';
  
  showEmojiPicker: boolean = false;
  commonEmojis: string[] = ['😀','😂','🥰','😎','😭','😡','👍','🙏','❤️','🔥','🎉','✨','💯','🤔','👀','😊','🙌','👏','💔','🙄'];
  isOnline = false;
  isLoading = false;
  otherUserTyping = false;
  lastSeenText = 'last seen recently';
  typingTimeout: any;
  replyingTo: any = null;
  connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'connected' = 'none';
  requestId: string | null = null;
  
  selectedMessageForReaction: any = null;

  // Voice Recording
  isRecording = false;
  recordingDuration = 0;
  recordInterval: any;
  mediaRecorder: any;
  audioChunks: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private authService: AuthService,
    private callService: CallService,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private loadingCtrl: LoadingController,
    private gestureCtrl: GestureController,
    private modalCtrl: ModalController
  ) {
    addIcons({ 
      videocam, call, ellipsisVertical, happyOutline, 
      attachOutline, cameraOutline, send, mic,
      checkmark, checkmarkDone, lockClosedOutline, closeCircle,
      downloadOutline, happy
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.userId = params['id'];
      this.name = params['name'];
      this.avatar = params['avatar'];
      this.chatType = params['type'] || 'private';
      this.connectionStatus = params['status'] || 'none';
      this.requestId = params['request_id'] || null;

      this.loadMessages();
      if (this.chatType === 'private' && this.connectionStatus !== 'connected') {
        this.checkConnection();
      }
    });

    this.authService.user$.subscribe(user => {
      if (user) this.currentUserId = user.id;
    });

    this.chatService.messages$.subscribe(msg => {
      if (msg.event === 'new_message' && 
         (msg.message.sender_id === this.userId || msg.message.receiver_id === this.userId)) {
        this.messages.push(msg.message);
        this.scrollToBottom();
        this.sendSeenNotification(msg.message.id);
      } else if (msg.event === 'typing' && msg.from_user_id === this.userId) {
        this.otherUserTyping = msg.is_typing;
      } else if (msg.event === 'user_presence' && msg.user_id === this.userId) {
        this.isOnline = msg.status === 'online';
        if (!this.isOnline && msg.last_seen) {
          this.lastSeenText = `last seen at ${new Date(msg.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      } else if (msg.event === 'message_status_update' || msg.event === 'messages_seen') {
        this.updateMessageStatus(msg);
      }
    });
  }

  ionViewDidEnter() {
    this.setupLongPressGesture();
    this.chatService.activeChatId = this.userId;
  }

  ionViewWillLeave() {
    this.chatService.activeChatId = null;
  }

  setupLongPressGesture() {
    // Small delay to ensure DOM is rendered
    setTimeout(() => {
      const bubbles = document.querySelectorAll('.message-bubble');
      bubbles.forEach((bubble: any) => {
        if (bubble.hasGesture) return;
        bubble.hasGesture = true;

        const gesture = this.gestureCtrl.create({
          el: bubble,
          threshold: 0,
          gestureName: 'long-press',
          onStart: () => {
            bubble.longPressTimeout = setTimeout(() => {
              const msgId = bubble.getAttribute('data-id');
              const msg = this.messages.find(m => m.id === msgId);
              if (msg) this.showReactionPicker(msg);
            }, 500);
          },
          onEnd: () => {
            clearTimeout(bubble.longPressTimeout);
          }
        });
        gesture.enable(true);
      });
    }, 200);
  }

  showReactionPicker(msg: any) {
    this.selectedMessageForReaction = msg;
  }

  hideReactionPicker() {
    this.selectedMessageForReaction = null;
  }

  checkConnection() {
    if (!this.userId || this.chatType === 'group') return;
    this.chatService.getConnectionStatus(this.userId).subscribe({
      next: (data) => {
        this.connectionStatus = data.connection_status;
        this.requestId = data.request_id || null;
      }
    });
  }

  loadMessages() {
    if (!this.userId) return;
    this.chatService.getMessages(this.userId).subscribe(messages => {
      this.messages = messages;
      this.scrollToBottom();
      this.setupLongPressGesture(); // Ensure gestures are set up for newly loaded messages
      if (this.messages.length > 0) {
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg.sender_id === this.userId) {
          this.sendSeenNotification(lastMsg.id);
        }
      }
    });
  }

  onInput() {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    
    this.chatService.sendTypingStatus(this.userId, true);
    
    this.typingTimeout = setTimeout(() => {
      this.chatService.sendTypingStatus(this.userId, false);
    }, 2000);
  }

  sendSeenNotification(messageId: string) {
    this.chatService.sendMessageSeen(messageId);
  }

  updateMessageStatus(msg: any) {
    if (msg.event === 'messages_seen') {
      this.messages.forEach(m => {
        if (m.sender_id === this.currentUserId) m.status = 'seen';
      });
    } else if (msg.event === 'message_status_update') {
      const found = this.messages.find(m => m.id === msg.message_id);
      if (found) found.status = msg.status;
    }
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    const content = this.newMessage;
    const replyId = this.replyingTo ? this.replyingTo.id : undefined;
    
    this.newMessage = '';
    this.replyingTo = null;

    if (this.chatType === 'group') {
      this.chatService.sendGroupMessage(this.userId, content, 'text', replyId).subscribe({
        next: () => this.scrollToBottom(),
        error: (err) => {
          console.error('Failed to send group message:', err);
          this.presentToast('Failed to send message', 'danger');
        }
      });
    } else {
      this.chatService.sendMessage(this.userId, content, 'text', replyId).subscribe({
        next: () => this.scrollToBottom(),
        error: (err) => {
          console.error('Failed to send message:', err);
          const msg = err.error?.detail || 'Failed to send message';
          this.presentToast(msg, 'danger');
        }
      });
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.content) {
        this.content.scrollToBottom(300);
      }
    }, 100);
  }

  setReply(msg: any) {
    this.replyingTo = msg;
  }

  cancelReply() {
    this.replyingTo = null;
  }

  openProfile() {
    // Implement profile viewing
  }

  startVideoCall() {
    this.callService.initiateCall(this.userId, 'video');
  }

  startAudioCall() {
    this.callService.initiateCall(this.userId, 'audio');
  }

  sendRequest() {
    this.chatService.sendConnectionRequest(this.userId).subscribe({
      next: () => {
        this.connectionStatus = 'pending_sent';
        this.presentToast('Connection request sent!', 'success');
      }
    });
  }

  acceptRequest() {
    if (!this.requestId) return;
    this.chatService.respondToRequest(this.requestId, 'accept').subscribe({
      next: () => {
        this.connectionStatus = 'connected';
        this.presentToast('You are now connected!', 'success');
        this.loadMessages();
      }
    });
  }

  rejectRequest() {
    if (!this.requestId) return;
    this.chatService.respondToRequest(this.requestId, 'reject').subscribe({
      next: () => {
        this.connectionStatus = 'none';
        this.requestId = null;
        this.presentToast('Request declined', 'medium');
      }
    });
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      mode: 'ios'
    });
    toast.present();
  }

  // --- Attachments ---
  async openAttachmentMenu() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Send Attachment',
      mode: 'ios',
      buttons: [
        {
          text: 'Photo / Video',
          icon: 'image',
          handler: () => {
            if (this.fileInput) {
              this.fileInput.nativeElement.click();
            }
          }
        },
        {
          text: 'Location (Simulated)',
          icon: 'location',
          handler: () => {
            this.sendAttachment('location', 'Lat: 40.7128, Lon: -74.0060');
          }
        },
        {
          text: 'Contact (Simulated)',
          icon: 'person',
          handler: () => {
            this.sendAttachment('contact', 'John Doe: +1234567890');
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = ''; // Reset

    const loading = await this.loadingCtrl.create({
      message: 'Uploading...',
      mode: 'ios'
    });
    await loading.present();

    this.chatService.uploadFile(file).subscribe({
      next: (res) => {
        const type = file.type.startsWith('image') ? 'image' : 'video';
        const url = `http://localhost:8000${res.url}`; // or environment.apiUrl if res.url is partial

        loading.dismiss();
        this.sendAttachment(type, url);
      },
      error: () => {
        loading.dismiss();
        this.presentToast('Upload failed', 'danger');
      }
    });
  }

  sendAttachment(type: string, content: string) {
    const replyId = this.replyingTo ? this.replyingTo.id : undefined;
    this.replyingTo = null;

    if (this.chatType === 'group') {
      this.chatService.sendGroupMessage(this.userId, content, type, replyId).subscribe({
        next: () => this.scrollToBottom(),
        error: (err) => {
          console.error('Failed to send group attachment:', err);
          this.presentToast('Failed to send attachment', 'danger');
        }
      });
    } else {
      this.chatService.sendMessage(this.userId, content, type, replyId).subscribe({
        next: () => this.scrollToBottom(),
        error: (err) => {
          console.error('Failed to send attachment:', err);
          const msg = err.error?.detail || 'Failed to send attachment';
          this.presentToast(msg, 'danger');
        }
      });
    }
  }

  // --- Reactions ---
  async presentReactionPicker(msg: any) {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'React',
      mode: 'ios',
      buttons: [
        { text: '❤️', handler: () => this.sendReaction(msg.id, '❤️') },
        { text: '😂', handler: () => this.sendReaction(msg.id, '😂') },
        { text: '😮', handler: () => this.sendReaction(msg.id, '😮') },
        { text: '😢', handler: () => this.sendReaction(msg.id, '😢') },
        { text: '🙏', handler: () => this.sendReaction(msg.id, '🙏') },
        { text: '👍', handler: () => this.sendReaction(msg.id, '👍') },
        { text: 'Cancel', role: 'cancel' }
      ]
    });
    await actionSheet.present();
  }

  sendReaction(messageId: string, emoji: string) {
    this.chatService.reactToMessage(messageId, emoji).subscribe({
      next: (res: any) => {
        const msg = this.messages.find(m => m.id === messageId);
        if (msg) msg.reactions = res.reactions;
        this.hideReactionPicker();
      }
    });
  }

  // --- Voice Message ---
  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  insertEmoji(emoji: string) {
    this.newMessage += emoji;
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event: any) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        const file = new File([audioBlob], `voice_message.${ext}`, { type: mimeType });
        
        const loading = await this.loadingCtrl.create({ message: 'Sending voice...', mode: 'ios' });
        await loading.present();

        this.chatService.uploadFile(file).subscribe({
          next: (res: any) => {
            loading.dismiss();
            const url = `${environment.apiUrl}${res.url}`;
            this.sendAttachment('voice', url);
          },
          error: () => {
            loading.dismiss();
            this.presentToast('Failed to send voice', 'danger');
          }
        });
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingDuration = 0;
      this.recordInterval = setInterval(() => this.recordingDuration++, 1000);
    } catch (err) {
      console.error('Error accessing mic:', err);
      this.presentToast('Microphone access denied', 'danger');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      clearInterval(this.recordInterval);
    }
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Media Download ---
  downloadMedia(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.presentToast('Starting download...', 'success');
  }

  async viewProfile() {
    if (this.chatType !== 'private' || !this.userId) return;
    
    const loading = await this.loadingCtrl.create({ spinner: 'bubbles', mode: 'ios' });
    await loading.present();

    this.chatService.getUserProfile(this.userId).subscribe({
      next: async (user) => {
        await loading.dismiss();
        const modal = await this.modalCtrl.create({
          component: UserProfileComponent,
          componentProps: { user },
          initialBreakpoint: 0.9,
          breakpoints: [0, 0.9, 1]
        });
        await modal.present();
      },
      error: async () => {
        await loading.dismiss();
        this.presentToast('Could not load profile', 'danger');
      }
    });
  }
}
