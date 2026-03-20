import { Component, OnInit, ViewChild } from '@angular/core';
import { 
  AlertController, 
  LoadingController, 
  ToastController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonContent,
  IonLabel,
  IonAvatar
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { AvatarComponent } from '../components/avatar/avatar.component';
import { 
  searchOutline, 
  ellipsisVertical,
  personOutline, 
  lockClosedOutline, 
  notificationsOutline, 
  documentTextOutline, 
  helpCircleOutline,
  cameraOutline,
  pencilOutline
} from 'ionicons/icons';

import { AuthService, User } from '../services/auth.service';
import { ChatService } from '../services/chat.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-tab4',
  templateUrl: 'tab4.page.html',
  styleUrls: ['tab4.page.scss'],
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
    IonList,
    IonItem,
    IonContent,
    IonLabel,
    IonAvatar
  ]
})
export class Tab4Page implements OnInit {
  user: User | null = null;
  @ViewChild('fileInput') fileInput: any;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    addIcons({ 
      searchOutline, 
      ellipsisVertical,
      personOutline, 
      lockClosedOutline, 
      notificationsOutline, 
      documentTextOutline, 
      helpCircleOutline,
      cameraOutline,
      pencilOutline
    });
  }

  ngOnInit() {
    this.authService.user$.subscribe(u => {
      this.user = u;
    });
    // Ensure we fetch latest if possible
    this.authService.getCurrentUser().subscribe();
  }

  async editName() {
    const alert = await this.alertCtrl.create({
      header: 'Enter your name',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.user?.name,
          placeholder: 'Your name'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { 
          text: 'Save', 
          handler: (data) => {
            if (data.name && data.name.trim() !== '') {
              this.updateProfile({ name: data.name });
            }
          } 
        }
      ]
    });
    await alert.present();
  }

  async editAbout() {
    const alert = await this.alertCtrl.create({
      header: 'About',
      inputs: [
        {
          name: 'about',
          type: 'text',
          value: this.user?.about,
          placeholder: 'Hey there! I am using TalkSpot.'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { 
          text: 'Save', 
          handler: (data) => {
            if (data.about !== undefined) {
              this.updateProfile({ about: data.about });
            }
          } 
        }
      ]
    });
    await alert.present();
  }

  triggerUpload() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image')) {
      const t = await this.toastCtrl.create({ message: 'Select an image file', duration: 2000 });
      return t.present();
    }

    const loading = await this.loadingCtrl.create({ message: 'Uploading...', spinner: 'crescent' });
    await loading.present();

    this.chatService.uploadFile(file).subscribe({
      next: async (res: any) => {
        const url = `${environment.apiUrl}${res.url}`;
        await this.updateProfile({ avatar: url });
        await loading.dismiss();
      },
      error: async () => {
        await loading.dismiss();
        const toast = await this.toastCtrl.create({ message: 'Failed to upload image', duration: 2000, color: 'danger' });
        toast.present();
      }
    });

    event.target.value = '';
  }

  private async updateProfile(data: any) {
    const loading = await this.loadingCtrl.create({ spinner: 'dots' });
    await loading.present();

    this.authService.updateProfile(data).subscribe({
      next: async () => {
        await loading.dismiss();
      },
      error: async () => {
        await loading.dismiss();
        const toast = await this.toastCtrl.create({ message: 'Failed to update profile', duration: 2000, color: 'danger' });
        toast.present();
      }
    });
  }
}
