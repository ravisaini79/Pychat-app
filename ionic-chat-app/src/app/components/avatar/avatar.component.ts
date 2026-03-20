import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonAvatar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule, IonAvatar],
  template: `
    <div class="avatar-container" [style.width.px]="size" [style.height.px]="size" [style.background-color]="bgColor">
      <img *ngIf="src && !imgError" [src]="src" (error)="onImgError()" [style.width.px]="size" [style.height.px]="size" />
      <span *ngIf="!src || imgError" class="initials" [style.font-size.px]="size * 0.4">
        {{ initials }}
      </span>
    </div>
  `,
  styles: [`
    .avatar-container {
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: white;
      font-weight: 500;
      text-transform: uppercase;
    }
    img {
      object-fit: cover;
    }
  `]
})
export class AvatarComponent {
  @Input() src: string | undefined;
  @Input() name: string = 'User';
  @Input() size: number = 40;

  imgError = false;

  get initials(): string {
    if (!this.name) return '?';
    const parts = this.name.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return this.name[0].toUpperCase();
  }

  get bgColor(): string {
    if (this.src && !this.imgError) return 'transparent';
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'];
    let hash = 0;
    for (let i = 0; i < this.name.length; i++) {
      hash = this.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  onImgError() {
    this.imgError = true;
  }
}
