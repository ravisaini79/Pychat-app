import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet, NavController, ToastController } from '@ionic/angular/standalone';
import { AuthService } from './services/auth.service';
import { ChatService } from './services/chat.service';
import { CallService } from './services/call.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private currentUserId: string | null = null;

  constructor(
    private authService: AuthService,
    private navCtrl: NavController,
    private chatService: ChatService,
    private toastCtrl: ToastController,
    private callService: CallService
  ) {}

  async ngOnInit() {
    // Wait for auth initialization
    await this.authService.init();
    
    // Check if user is logged in
    this.authService.token$.subscribe(token => {
      if (token) {
        // Only redirect to tabs if on login or root
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/login' || currentPath === '') {
          this.navCtrl.navigateRoot('/tabs/tab1');
        }
      }
    });

    this.authService.user$.subscribe(user => {
      this.currentUserId = user ? user.id : null;
    });

    // Subscribe to new messages for global notifications
    this.chatService.messages$.subscribe(msg => {
      this.handleNewMessage(msg);
    });
  }

  async handleNewMessage(msg: any) {
    if (msg.event === 'new_message') {
      const currentUserId = this.currentUserId;
      const message = msg.message;

      // Don't show notification if:
      // 1. Message is from self
      // 2. User is already in the chat with this sender
      if (message.sender_id === currentUserId) return;
      if (this.chatService.activeChatId === message.sender_id) return;

      // Show Toast Notification
      const toast = await this.toastCtrl.create({
        header: 'New Message',
        message: message.content.length > 50 ? message.content.substring(0, 47) + '...' : message.content,
        duration: 3000,
        position: 'top',
        mode: 'ios',
        buttons: [
          {
            text: 'View',
            handler: () => {
              this.navCtrl.navigateForward('/tabs/tab1', { 
                queryParams: { 
                  id: message.sender_id,
                  name: 'User', // In a real app, we'd fetch the sender's name
                  type: 'private'
                } 
              });
            }
          }
        ]
      });
      await toast.present();
    }
  }
}
