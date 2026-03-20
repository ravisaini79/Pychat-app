import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  NavController, 
  ActionSheetController, 
  LoadingController, 
  ModalController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonPopover,
  IonList,
  IonListHeader,
  IonItem,
  IonContent,
  IonLabel,
  IonFab,
  IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  searchOutline, 
  ellipsisVertical, 
  camera, 
  pencil,
  add
} from 'ionicons/icons';
import { ChatService } from '../services/chat.service';
import { AvatarComponent } from '../components/avatar/avatar.component';
import { environment } from '../../environments/environment';
import { StoryViewerComponent } from '../components/story-viewer/story-viewer.component';
import { AuthService } from '../services/auth.service';


@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    AvatarComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonPopover,
    IonList,
    IonListHeader,
    IonItem,
    IonContent,
    IonLabel,
    IonFab,
    IonFabButton
  ]
})
export class Tab2Page {
  @ViewChild('fileInput') fileInput: any;
  statuses: any[] = [];
  groupedStatuses: any[] = [];
  myGroupedStatus: any = null;
  apiUrl = environment.apiUrl;
  myId: string = '';
  myAvatar: string | null = null;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private navCtrl: NavController,
    private actionSheetCtrl: ActionSheetController,
    private loadingCtrl: LoadingController,
    private modalCtrl: ModalController
  ) {
    addIcons({ searchOutline, ellipsisVertical, camera, pencil, add });
  }

  ionViewWillEnter() {
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.myId = user.id;
        this.myAvatar = (user as any).avatar;
      }
      this.loadStatuses();
    });
  }

  loadStatuses() {
    this.chatService.getStatuses().subscribe((res: any) => {
      this.statuses = res;
      this.groupStatuses();
    });
  }

  groupStatuses() {
    // Group flat statuses by user_id
    const grouped = new Map<string, any>();
    
    for (const status of this.statuses) {
      if (!grouped.has(status.user_id)) {
        grouped.set(status.user_id, {
          user_id: status.user_id,
          user_name: status.user_name,
          avatar: status.avatar,
          statuses: []
        });
      }
      grouped.get(status.user_id).statuses.push(status);
    }

    // Convert map to array and sort: 
    // Usually sorted by the most recent status in the group
    const allGroups = Array.from(grouped.values()).sort((a, b) => {
      const aRecent = a.statuses[0].created_at;
      const bRecent = b.statuses[0].created_at;
      return new Date(bRecent).getTime() - new Date(aRecent).getTime();
    });

    this.myGroupedStatus = allGroups.find(g => g.user_id === this.myId) || null;
    this.groupedStatuses = allGroups.filter(g => g.user_id !== this.myId);
  }

  async addStatus() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Post Status',
      mode: 'ios',
      buttons: [
        {
          text: 'Text Status',
          icon: 'pencil',
          handler: () => { this.promptTextStatus(); }
        },
        {
          text: 'Photo / Video',
          icon: 'camera',
          handler: () => {
            if (this.fileInput) {
              this.fileInput.nativeElement.click();
            }
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

    // Reset input
    event.target.value = '';

    const loading = await this.loadingCtrl.create({
      message: 'Uploading...',
      mode: 'ios'
    });
    await loading.present();

    this.chatService.uploadFile(file).subscribe({
      next: (res) => {
        const type = file.type.startsWith('image') ? 'image' : 'video';
        // Post the status with the uploaded URL
        this.chatService.postStatus({
          type: type,
          content: `${this.apiUrl}${res.url}`,
          background_color: '#000000'
        }).subscribe({
          next: () => {
            loading.dismiss();
            this.loadStatuses();
          },
          error: () => {
             loading.dismiss();
          }
        });
      },
      error: () => {
        loading.dismiss();
      }
    });
  }

  async promptTextStatus() {
    const alert = await this.chatService.createAlert({
      header: 'New Text Status',
      inputs: [{ name: 'content', type: 'text', placeholder: "What's on your mind?" }],
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
              }).subscribe(() => this.loadStatuses());
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async myStatusOptions(event: Event) {
    // Prevent opening the status viewer when clicking the extra options icon
    // We could add an ActionSheet here to delete statuses or view who saw them in a list view.
    // For now, it's just a placeholder for WhatsApp-style options.
  }

  async openStatus(group: any) {
    const modal = await this.modalCtrl.create({
      component: StoryViewerComponent,
      componentProps: { group },
      cssClass: 'story-viewer-modal'
    });
    
    await modal.present();
    await modal.onDidDismiss();
    
    // Optionally reload to update status rings
    this.loadStatuses();
  }

  statusPrivacy() { console.log('Status Privacy'); }
  openSettings() { this.navCtrl.navigateForward('/tabs/tab4'); }

  getStrokeDasharray(count: number): string {
    if (count <= 1) return 'none';
    // Math to create dashed segments for story rings
    const circumference = 2 * Math.PI * 48; // r=48
    const gap = 10; // 10px gap
    const dashLength = (circumference - (gap * count)) / count;
    return `${dashLength} ${gap}`;
  }
}
