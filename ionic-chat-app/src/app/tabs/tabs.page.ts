import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  chatbubblesOutline, 
  chatbubbles, 
  apertureOutline, 
  aperture, 
  callOutline, 
  call, 
  personCircleOutline, 
  personCircle 
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  constructor() {
    addIcons({ 
      chatbubblesOutline, chatbubbles, 
      apertureOutline, aperture, 
      callOutline, call, 
      personCircleOutline, personCircle 
    });
  }
}
