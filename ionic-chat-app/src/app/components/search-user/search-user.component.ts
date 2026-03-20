import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  ModalController, 
  ToastController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner,
  IonBadge
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, checkmarkCircle, arrowBack } from 'ionicons/icons';
import { ChatService } from '../../services/chat.service';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-search-user',
  templateUrl: './search-user.component.html',
  styleUrls: ['./search-user.component.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    AvatarComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
    IonBadge
  ]
})
export class SearchUserComponent {
  users: any[] = [];
  isLoading = false;
  searchAttempted = false;

  constructor(
    private modalCtrl: ModalController,
    private chatService: ChatService,
    private toastCtrl: ToastController
  ) {
    addIcons({ searchOutline, checkmarkCircle, arrowBack });
  }

  onSearch(event: any) {
    const query = event.target.value;
    if (!query || query.trim().length < 3) {
      this.users = [];
      this.searchAttempted = false;
      return;
    }

    this.isLoading = true;
    this.searchAttempted = true;
    
    this.chatService.searchUsers(query.trim()).subscribe({
      next: (users) => {
        this.users = users;
        this.isLoading = false;
      },
      error: (err) => {
        this.users = [];
        this.isLoading = false;
      }
    });
  }

  sendRequest(user: any) {
    this.chatService.sendConnectionRequest(user.id).subscribe({
      next: async () => {
        user.connection_status = 'pending_sent';
        const toast = await this.toastCtrl.create({
          message: 'Connection request sent!',
          duration: 2000,
          color: 'success'
        });
        toast.present();
      },
      error: async (err) => {
        const toast = await this.toastCtrl.create({
          message: err.error?.detail || 'Failed to send request',
          duration: 2000,
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
