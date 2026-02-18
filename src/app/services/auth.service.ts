import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { EnvStorageService } from './env-storage.service';

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthLoginResponse = {
  tokenType: string;
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  user: AuthUser;
};

const ACCESS_TOKEN_KEY = 'auth.access_token';
const REFRESH_TOKEN_KEY = 'auth.refresh_token';
const TOKEN_TYPE_KEY = 'auth.token_type';
const EXPIRES_AT_KEY = 'auth.expires_at';
const USER_KEY = 'auth.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private accessTokenSig = signal<string | null>(null);
  private refreshTokenSig = signal<string | null>(null);
  private tokenTypeSig = signal<string>('Bearer');
  private expiresAtSig = signal<number>(0);
  private userSig = signal<AuthUser | null>(null);

  readonly user = computed(() => this.userSig());
  readonly isAuthenticatedSignal = computed(() => this.hasValidAccessToken());

  private refreshInFlight$: Observable<AuthLoginResponse> | null = null;

  constructor() {
    this.restoreFromStorage();
  }

  getAccessToken(): string | null {
    return this.accessTokenSig();
  }

  getRefreshToken(): string | null {
    return this.refreshTokenSig();
  }

  getTokenType(): string {
    return this.tokenTypeSig() || 'Bearer';
  }

  isAuthenticated(): boolean {
    return this.hasValidAccessToken();
  }

  login(email: string, password: string): Observable<AuthLoginResponse> {
    return this.http
      .post<AuthLoginResponse>(`${this.authBase()}/login`, { email, password })
      .pipe(tap((res) => this.setSession(res)));
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.authBase()}/me`).pipe(
      tap((u) => this.userSig.set(u))
    );
  }

  ensureAuthenticated(): Observable<boolean> {
    if (this.hasValidAccessToken()) return of(true);
    if (!this.getRefreshToken()) return of(false);
    return this.refreshAccessToken().pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  refreshAccessToken(): Observable<AuthLoginResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return throwError(() => new Error('Sem refresh token.'));

    if (this.refreshInFlight$) return this.refreshInFlight$;

    this.refreshInFlight$ = this.http
      .post<AuthLoginResponse>(`${this.authBase()}/refresh`, { refreshToken })
      .pipe(
        tap((res) => this.setSession(res)),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight$;
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return of(void 0);
    }

    return this.http.post<void>(`${this.authBase()}/logout`, { refreshToken }).pipe(
      catchError(() => of(void 0)),
      tap(() => this.clearSession())
    );
  }

  clearSession() {
    this.accessTokenSig.set(null);
    this.refreshTokenSig.set(null);
    this.tokenTypeSig.set('Bearer');
    this.expiresAtSig.set(0);
    this.userSig.set(null);
    this.clearStorage();
  }

  private hasValidAccessToken(): boolean {
    const token = this.accessTokenSig();
    if (!token) return false;

    const now = Math.floor(Date.now() / 1000);
    const storageExp = this.expiresAtSig();
    if (storageExp && now >= storageExp - 30) return false;

    const jwtExp = this.jwtExp(token);
    if (jwtExp && now >= jwtExp - 30) return false;

    return true;
  }

  private setSession(res: AuthLoginResponse) {
    const tokenType = (res.tokenType || 'Bearer').trim() || 'Bearer';
    const accessToken = String(res.accessToken || '').trim();
    const refreshToken = String(res.refreshToken || '').trim();
    const expiresIn = Number(res.expiresInSeconds || 0);
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(0, expiresIn);
    const user = res.user ? { id: String(res.user.id), email: String(res.user.email) } : null;

    this.accessTokenSig.set(accessToken || null);
    this.refreshTokenSig.set(refreshToken || null);
    this.tokenTypeSig.set(tokenType);
    this.expiresAtSig.set(expiresAt);
    this.userSig.set(user);
    this.persistStorage();
  }

  private restoreFromStorage() {
    try {
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const tokenType = localStorage.getItem(TOKEN_TYPE_KEY) || 'Bearer';
      const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) || 0);
      const userRaw = localStorage.getItem(USER_KEY);
      const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null;

      this.accessTokenSig.set(accessToken || null);
      this.refreshTokenSig.set(refreshToken || null);
      this.tokenTypeSig.set(tokenType);
      this.expiresAtSig.set(Number.isFinite(expiresAt) ? expiresAt : 0);
      this.userSig.set(user);
    } catch {
      this.clearSession();
    }
  }

  private persistStorage() {
    try {
      const accessToken = this.accessTokenSig();
      const refreshToken = this.refreshTokenSig();
      const tokenType = this.tokenTypeSig();
      const expiresAt = this.expiresAtSig();
      const user = this.userSig();

      if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      else localStorage.removeItem(ACCESS_TOKEN_KEY);

      if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);

      localStorage.setItem(TOKEN_TYPE_KEY, tokenType || 'Bearer');
      localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt || 0));
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {
      // ignore storage failures
    }
  }

  private clearStorage() {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(TOKEN_TYPE_KEY);
      localStorage.removeItem(EXPIRES_AT_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore storage failures
    }
  }

  private authBase(): string {
    const backend = this.env.getActive()?.backend?.trim() || '/api/db';
    return backend.replace(/\/api\/db\/?$/i, '/api/auth');
  }

  private jwtExp(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const json = atob(padded);
      const data = JSON.parse(json);
      const exp = Number(data?.exp);
      return Number.isFinite(exp) ? exp : null;
    } catch {
      return null;
    }
  }
}
