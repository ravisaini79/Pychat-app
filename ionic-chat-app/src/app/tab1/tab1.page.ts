import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  NavController, 
  ModalController, 
  ToastController, 
  ActionSheetController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonPopover,
  IonList,
  IonItem,
  IonContent,
  IonBadge,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonFab,
  IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  searchOutline, 
  ellipsisVertical, 
  chatboxEllipses, 
  checkmarkCircle, 
  closeCircle,
  peopleOutline,
  megaphoneOutline,
  laptopOutline,
  starOutline,
  settingsOutline
} from 'ionicons/icons';
import { ChatService } from '../services/chat.service';
import { SearchUserComponent } from '../components/search-user/search-user.component';
import { DraggableFabComponent } from '../components/draggable-fab/draggable-fab.component';
import { AvatarComponent } from '../components/avatar/avatar.component';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    DraggableFabComponent, 
    AvatarComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonPopover,
    IonList,
    IonItem,
    IonContent,
    IonBadge,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    IonFab,
    IonFabButton
  ]
})
export class Tab1Page implements OnInit {
  chats: any[] = [];
  pendingRequests: any[] = [];

  constructor(
    private chatService: ChatService,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController
  ) {
    addIcons({ 
      searchOutline, 
      ellipsisVertical, 
      chatboxEllipses, 
      checkmarkCircle, 
      closeCircle,
      peopleOutline,
      megaphoneOutline,
      laptopOutline,
      starOutline,
      settingsOutline
    });
  }

  ionViewWillEnter() {
    this.loadData();
  }

  ngOnInit() {
    this.chatService.messages$.subscribe((msg: any) => {
      if (msg.event === 'new_connection_request') {
        this.loadRequests();
      } else if (msg.event === 'connection_accepted' || msg.event === 'new_message') {
        this.loadConversations();
      }
    });
  }

  loadData() {
    this.loadConversations();
    this.loadRequests();
  }

  loadConversations() {
    this.chatService.getConversations().subscribe((convos: any[]) => {
      this.chats = convos.map(c => ({
        ...c,
        lastMessageTime: c.last_at ? new Date(c.last_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      }));
    });
  }

  loadRequests() {
    this.chatService.getConnectionRequests().subscribe((res: any) => {
      this.pendingRequests = res.incoming;
    });
  }


  async acceptRequest(req: any) {
    this.chatService.respondToRequest(req.id, 'accept').subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: `You are now connected with ${req.from_user.name}!`,
          duration: 3000,
          color: 'success',
          position: 'bottom',
          mode: 'ios'
        });
        toast.present();
        this.loadData();
      },
      error: async (err) => {
        const toast = await this.toastCtrl.create({
          message: 'Failed to accept request',
          duration: 2000,
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  async rejectRequest(req: any) {
    this.chatService.respondToRequest(req.id, 'reject').subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: 'Request declined',
          duration: 2000,
          color: 'medium'
        });
        toast.present();
        this.loadData();
      }
    });
  }

  async openSearchModal() {
    const modal = await this.modalCtrl.create({
      component: SearchUserComponent
    });
    modal.present();
    await modal.onWillDismiss();
    this.loadData();
  }

  openChat(chat: any) {
    this.navCtrl.navigateForward(['/chat-detail'], {
      queryParams: { 
        id: chat.id, 
        name: chat.name, 
        avatar: chat.avatar,
        type: chat.type
      }
    });
  }

  async openStatus(contact: any) {
    // Basic story viewer logic would go here
    const toast = await this.toastCtrl.create({
      message: `Viewing ${contact.user_name}'s status...`,
      duration: 1500,
      position: 'top'
    });
    toast.present();
  }

  async addStatus() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Post Status',
      buttons: [
        {
          text: 'Text Status',
          handler: () => {
            this.promptTextStatus();
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

  async promptTextStatus() {
    const alert = await this.chatService.createAlert({
      header: 'New Text Status',
      inputs: [
        { name: 'content', type: 'text', placeholder: 'What\'s on your mind?' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Post',
          handler: (data: any) => {
            if (data.content) {
              this.chatService.postStatus({
                type: 'text',
                content: data.content,
                background_color: '#128C7E'
              }).subscribe();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async openMenu(event: Event) {
    // This will be handled by ion-popover or similar if implemented, 
    // for now we'll use a simple Action Sheet or just rely on the template.
  }

  newGroup() { console.log('New Group'); }
  newBroadcast() { console.log('New Broadcast'); }
  linkedDevices() { console.log('Linked Devices'); }
  starredMessages() { console.log('Starred Messages'); }
  openSettings() { this.navCtrl.navigateForward('/tabs/tab4'); }
}
