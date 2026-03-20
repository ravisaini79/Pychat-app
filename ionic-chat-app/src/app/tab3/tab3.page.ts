import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  NavController, 
  LoadingController,
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
  IonLabel,
  IonFab,
  IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { ChatService } from '../services/chat.service';
import { CallService } from '../services/call.service';
import { AvatarComponent } from '../components/avatar/avatar.component';
import { 
  searchOutline, 
  ellipsisVertical, 
  callOutline,
  videocamOutline,
  arrowForwardOutline,
  arrowBackOutline,
  add
} from 'ionicons/icons';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
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
    IonItem,
    IonContent,
    IonLabel,
    IonFab,
    IonFabButton
  ]
})
export class Tab3Page {
  calls: any[] = [];

  constructor(
    private navCtrl: NavController,
    private chatService: ChatService,
    private callService: CallService,
    private loadingCtrl: LoadingController
  ) {
    addIcons({ 
      searchOutline, 
      ellipsisVertical, 
      callOutline, 
      videocamOutline, 
      arrowForwardOutline, 
      arrowBackOutline,
      add
    });
  }

  async ionViewWillEnter() {
    this.loadCallHistory();
  }

  async loadCallHistory() {
    this.chatService.getCalls().subscribe(calls => {
      this.calls = calls;
    });
  }

  reCall(call: any) {
    this.callService.initiateCall(call.other_user.id, call.type);
  }

  clearCallLog() { 
    // This could call a delete all endpoint
    this.calls = [];
  }
  openSettings() { this.navCtrl.navigateForward('/tabs/tab4'); }
}
