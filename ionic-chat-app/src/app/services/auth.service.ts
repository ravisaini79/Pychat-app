import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map, tap, switchMap } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  mobile?: string;
  name: string;
  about?: string;
  avatar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private _user = new BehaviorSubject<User | null>(null);
  private _token = new BehaviorSubject<string | null>(null);
  private _storage: Storage | null = null;

  constructor(private http: HttpClient, private storage: Storage) {
    this.init();
  }

  async init() {
    const storage = await this.storage.create();
    this._storage = storage;
    const token = await this._storage.get('token');
    const user = await this._storage.get('user');
    if (token && user) {
      this._token.next(token);
      this._user.next(user);
    }
  }

  get user$(): Observable<User | null> {
    return this._user.asObservable();
  }

  get token$(): Observable<string | null> {
    return this._token.asObservable();
  }

  login(credentials: { mobile: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap(async (response) => {
        if (response.access_token) {
          await this._storage?.set('token', response.access_token);
          this._token.next(response.access_token);
          // Store user info
          await this._storage?.set('user', response.user);
          this._user.next(response.user);
        }
      })
    );
  }

  register(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, formData);
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${this._token.value}` }
    }).pipe(
      tap(async (user) => {
        await this._storage?.set('user', user);
        this._user.next(user);
      })
    );
  }

  updateProfile(data: { name?: string, about?: string, avatar?: string }): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/auth/me`, data, {
      headers: { Authorization: `Bearer ${this._token.value}` }
    }).pipe(
      tap(async (user) => {
        await this._storage?.set('user', user);
        this._user.next(user);
      })
    );
  }

  async logout() {
    await this._storage?.remove('token');
    await this._storage?.remove('user');
    this._token.next(null);
    this._user.next(null);
  }
}
