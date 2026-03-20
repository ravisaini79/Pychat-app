import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  IonFooter,
  IonTextarea,
  IonProgressBar,
  IonModal
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, chevronBack, chevronForward, eye, send, trashOutline } from 'ionicons/icons';
import { AvatarComponent } from '../avatar/avatar.component';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-story-viewer',
  templateUrl: './story-viewer.component.html',
  styleUrls: ['./story-viewer.component.scss'],
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
    IonList,
    IonItem,
    IonLabel,
    IonFooter,
    IonTextarea,
    IonProgressBar,
    IonModal
  ]
})
export class StoryViewerComponent implements OnInit, OnDestroy {
  @Input() group: any; // { user_id, user_name, avatar, statuses: [] }
  @ViewChild('videoPlayer', { static: false }) videoPlayer!: ElementRef;

  currentIndex = 0;
  progressValues: number[] = [];
  timer: any;
  isPaused = false;
  STORY_DURATION = 5000; // 5 seconds per image/text
  myId: string = '';
  replyText: string = '';
  viewers: any[] = [];
  showViewers: boolean = false;

  constructor(private modalCtrl: ModalController, private chatService: ChatService, private authService: AuthService) {
    addIcons({ close, chevronBack, chevronForward, eye, send, trashOutline });
  }

  ngOnInit() {
    this.authService.getCurrentUser().subscribe(u => { if (u) this.myId = u.id; });

    // Sort oldest to newest for viewing
    if (this.group && this.group.statuses) {
      this.group.statuses.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      this.progressValues = new Array(this.group.statuses.length).fill(0);
      this.markAsViewed();
      this.startTimer();
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  get currentStory() {
    return this.group.statuses[this.currentIndex];
  }

  dismiss() {
    this.stopTimer();
    this.modalCtrl.dismiss();
  }

  startTimer() {
    this.stopTimer();
    this.isPaused = false;
    let progress = 0;
    const interval = 50; // Update every 50ms
    const step = (interval / this.STORY_DURATION) * 100;

    this.timer = setInterval(() => {
      if (!this.isPaused) {
        progress += step;
        this.progressValues[this.currentIndex] = progress;
        
        // If it's a video, rely on video 'ended' event instead of the fixed timer
        if (this.currentStory.type !== 'video' && progress >= 100) {
          this.nextStory();
        }
      }
    }, interval);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  pauseStory() {
    this.isPaused = true;
    if (this.currentStory.type === 'video' && this.videoPlayer) {
      this.videoPlayer.nativeElement.pause();
    }
  }

  resumeStory() {
    this.isPaused = false;
    if (this.currentStory.type === 'video' && this.videoPlayer) {
      this.videoPlayer.nativeElement.play();
    }
  }

  nextStory() {
    // Fill current progress to 100 just in case skipped
    this.progressValues[this.currentIndex] = 100;
    
    if (this.currentIndex < this.group.statuses.length - 1) {
      this.currentIndex++;
      this.markAsViewed();
      this.startTimer();
    } else {
      this.dismiss();
    }
  }

  prevStory() {
    // Reset current and previous
    this.progressValues[this.currentIndex] = 0;
    
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.progressValues[this.currentIndex] = 0;
      this.markAsViewed();
      this.startTimer();
    } else {
      // Restart current
      this.startTimer();
    }
  }

  markAsViewed() {
    if (!this.group || !this.currentStory) return;
    const story = this.currentStory;
    if (story.user_id !== this.myId && !story.viewed_by_me) {
      this.chatService.viewStatus(story.id).subscribe();
      story.viewed_by_me = true;
    }
  }

  sendReply() {
    if (!this.replyText.trim()) return;
    this.chatService.sendMessage(this.group.user_id, this.replyText, 'text').subscribe(() => {
      this.replyText = '';
      this.dismiss();
    });
  }

  async openViewers() {
    if (this.group.user_id !== this.myId) return;
    
    this.pauseStory();
    this.chatService.getStatusViewers(this.currentStory.id).subscribe({
      next: (viewers) => {
        this.viewers = viewers;
        this.showViewers = true;
      },
      error: (err) => {
        console.error('Failed to load viewers:', err);
        this.resumeStory();
      }
    });
  }

  closeViewers() {
    this.showViewers = false;
    this.resumeStory();
  }

  onVideoEnded() {
    this.nextStory();
  }

  deleteStatus() {
    const statusToDelete = this.currentStory;
    if (!statusToDelete) return;

    this.chatService.deleteStatus(statusToDelete.id).subscribe({
      next: () => {
        // Remove from local list
        this.group.statuses.splice(this.currentIndex, 1);
        
        if (this.group.statuses.length === 0) {
          this.dismiss();
        } else {
          // Adjust index if we were at the end
          if (this.currentIndex >= this.group.statuses.length) {
            this.currentIndex = this.group.statuses.length - 1;
          }
          // Restart timer for the "new" current story at this index
          this.progressValues = new Array(this.group.statuses.length).fill(0);
          for(let i=0; i<this.currentIndex; i++) this.progressValues[i] = 100;
          this.startTimer();
        }
      },
      error: (err) => {
        console.error('Failed to delete status:', err);
      }
    });
  }
}
