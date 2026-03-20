import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner, 
  IonButtons,
  ToastController,
  NavController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  chatbubbles, 
  callOutline, 
  lockClosedOutline, 
  eyeOutline, 
  eyeOffOutline,
  chevronDownOutline 
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonIcon, 
    IonSpinner, 
    IonButtons,
    CommonModule, 
    FormsModule
  ]
})
export class LoginPage implements OnInit {
  mobile = '';
  password = '';
  showPassword = false;
  isLoading = false;

  constructor(
    private authService: AuthService,
    private toastCtrl: ToastController,
    private navCtrl: NavController
  ) {
    addIcons({ chatbubbles, callOutline, lockClosedOutline, eyeOutline, eyeOffOutline, chevronDownOutline });
  }

  ngOnInit() {}

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async onLogin() {
    if (!this.mobile || !this.password) {
      const toast = await this.toastCtrl.create({
        message: 'Please enter both mobile and password',
        duration: 2000,
        color: 'warning'
      });
      toast.present();
      return;
    }

    this.isLoading = true;
    this.authService.login({ mobile: this.mobile, password: this.password }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.presentToast('Login successful!', 'success');
        this.navCtrl.navigateRoot('/tabs/tab1');
      },
      error: async (err) => {
        this.isLoading = false;
        const msg = err.error?.detail || 'Login failed. Please check your credentials.';
        this.presentToast(msg, 'danger');
      }
    });
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      mode: 'ios',
      position: 'bottom'
    });
    toast.present();
  }

  onForgotPassword() {
    // Implement forgot password logic
  }

  goToRegister() {
    this.navCtrl.navigateForward('/register');
  }
}
