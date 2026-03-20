import { Component, Output, EventEmitter, HostListener } from '@angular/core';
import { IonFab, IonFabButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personAdd } from 'ionicons/icons';

@Component({
  selector: 'app-draggable-fab',
  templateUrl: './draggable-fab.component.html',
  styleUrls: ['./draggable-fab.component.scss'],
  standalone: true,
  imports: [IonFab, IonFabButton, IonIcon]
})
export class DraggableFabComponent {
  @Output() fabClick = new EventEmitter<void>();

  x = 0;
  y = 0;
  private isDragging = false;
  private startX = 0;
  private startY = 0;

  constructor() {
    addIcons({ personAdd });
  }

  onDragStart(event: any) {
    this.isDragging = true;
    const pos = event.type.includes('touch') ? event.touches[0] : event;
    this.startX = pos.clientX - this.x;
    this.startY = pos.clientY - this.y;
  }

  @HostListener('document:mousemove', ['$event'])
  @HostListener('document:touchmove', ['$event'])
  onDragMove(event: any) {
    if (!this.isDragging) return;
    
    const pos = event.type.includes('touch') ? event.touches[0] : event;
    this.x = pos.clientX - this.startX;
    this.y = pos.clientY - this.startY;
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  onDragEnd() {
    this.isDragging = false;
  }

  onClick() {
    if (Math.abs(this.x) < 5 && Math.abs(this.y) < 5) {
      this.fabClick.emit();
    }
  }
}
