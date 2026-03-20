import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  ModalController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonAvatar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, call, videocam, mail, documentText } from 'ionicons/icons';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
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
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonAvatar
  ]
})
export class UserProfileComponent implements OnInit {
  @Input() user: any; // { id, name, mobile, avatar, about, last_seen }

  constructor(private modalCtrl: ModalController) {
    addIcons({ close, call, videocam, mail, documentText });
  }

  ngOnInit() {}

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
