import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, 
  IonHeader, 
  IonTitle, 
  IonToolbar, 
  IonItem, 
  IonInput, 
  IonButton, 
  IonIcon, 
  IonButtons,
  IonBackButton,
  IonSpinner, 
  ToastController,
  NavController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  personOutline, 
  callOutline, 
  lockClosedOutline, 
  eyeOutline, 
  eyeOffOutline,
  camera,
  informationCircleOutline,
  chevronBackOutline
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    AvatarComponent,
    IonContent, 
    IonHeader, 
    IonTitle, 
    IonToolbar, 
    IonItem, 
    IonInput, 
    IonButton, 
    IonIcon, 
    IonSpinner, 
    IonButtons,
    IonBackButton
  ]
})
export class RegisterPage implements OnInit {
  fullName = '';
  mobile = '';
  about = 'Hey there! I am using TalkSpot.';
  password = '';
  showPassword = false;
  isLoading = false;
  
  selectedFile: File | null = null;
  profilePreview: string | null = null;

  constructor(
    private authService: AuthService,
    private toastCtrl: ToastController,
    private navCtrl: NavController
  ) {
    addIcons({ 
      personOutline, 
      callOutline, 
      lockClosedOutline, 
      eyeOutline, 
      eyeOffOutline,
      camera,
      informationCircleOutline,
      chevronBackOutline
    });
  }

  ngOnInit() {}

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profilePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async onRegister() {
    if (!this.fullName || !this.mobile || !this.password) {
      this.presentToast('Please fill in required fields', 'warning');
      return;
    }

    this.isLoading = true;
    const formData = new FormData();
    formData.append('name', this.fullName);
    formData.append('mobile', this.mobile);
    formData.append('about', this.about);
    formData.append('password', this.password);
    if (this.selectedFile) {
      formData.append('avatar', this.selectedFile);
    }

    this.authService.register(formData).subscribe({
      next: async (res) => {
        this.isLoading = false;
        await this.presentToast('Account created successfully!', 'success');
        this.navCtrl.navigateRoot('/login');
      },
      error: async (err) => {
        this.isLoading = false;
        const msg = err.error?.detail || 'Registration failed. Please try again.';
        this.presentToast(msg, 'danger');
      }
    });
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color
    });
    toast.present();
  }

  goToLogin() {
    this.navCtrl.navigateBack('/login');
  }
}
