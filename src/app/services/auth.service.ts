import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { EnvStorageService } from './env-storage.service';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type AuthLoginResponse = {
  tokenType: string;
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  user: AuthUser;
};

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
};

export type PermissionCatalogItem = {
  code: string;
  label: string;
  description: string;
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
  private permissionCatalogSig = signal<PermissionCatalogItem[]>([]);

  readonly user = computed(() => this.userSig());
  readonly permissionCatalog = computed(() => this.permissionCatalogSig());
  readonly visiblePermissionCatalog = computed(() => {
    const allowed = new Set(this.permissions());
    return this.permissionCatalogSig().filter((item) => allowed.has(item.code));
  });
  readonly isAuthenticatedSignal = computed(() => this.hasValidAccessToken());
  readonly state = computed<AuthState>(() => ({
    accessToken: this.accessTokenSig(),
    refreshToken: this.refreshTokenSig(),
    user: this.userSig(),
  }));

  private refreshInFlight$: Observable<AuthLoginResponse> | null = null;
  private readonly authStorageKeys = new Set([
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    TOKEN_TYPE_KEY,
    EXPIRES_AT_KEY,
    USER_KEY,
  ]);

  constructor() {
    this.restoreFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorageSync);
    }
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

  hasSession(): boolean {
    return !!this.userSig() && (!!this.accessTokenSig() || !!this.refreshTokenSig());
  }

  roles(): string[] {
    return this.userSig()?.roles ?? [];
  }

  permissions(): string[] {
    return this.userSig()?.permissions ?? [];
  }

  isAdmin(): boolean {
    return this.hasRole('ADMIN');
  }

  hasRole(role: string): boolean {
    const expected = this.normalizeRoleToken(role);
    if (!expected) return false;
    return this.roles().some((r) => this.normalizeRoleToken(r) === expected);
  }

  hasPermission(permission: string): boolean {
    const expected = String(permission || '').trim().toUpperCase();
    if (!expected) return false;
    return this.permissions().some((p) => String(p || '').trim().toUpperCase() === expected);
  }

  getDefaultAuthenticatedRoute(): string {
    if (this.hasPermission('SQL_METADATA_READ') || this.isAdmin()) return '/schemas';
    if (this.hasPermission('SQL_QUERY_EXECUTE') || this.isAdmin()) return '/query';
    if (
      this.hasPermission('EMAIL_SEND') ||
      this.hasPermission('EMAIL_TEST') ||
      this.hasPermission('EMAIL_SCHEDULE_READ') ||
      this.hasPermission('EMAIL_SCHEDULE_WRITE') ||
      this.isAdmin()
    ) {
      return '/schedules';
    }
    if (
      this.hasPermission('REPORT_READ') ||
      this.hasPermission('REPORT_RUN') ||
      this.hasPermission('REPORT_WRITE') ||
      this.isAdmin()
    ) {
      return '/reports';
    }
    return '/reports';
  }

  login(email: string, password: string): Observable<AuthLoginResponse> {
    return this.http
      .post<AuthLoginResponse>(`${this.authBase()}/login`, { email, password })
      .pipe(
        tap((res) => this.setSession(res)),
        switchMap((res) =>
          this.loadPermissionCatalog().pipe(
            map(() => res),
            catchError(() => of(res))
          )
        )
      );
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.authBase()}/me`).pipe(tap((u) => this.applyUser(u)));
  }

  bootstrapSession(): Observable<void> {
    const hasAccess = !!this.getAccessToken();
    const hasRefresh = !!this.getRefreshToken();
    if (!hasAccess && !hasRefresh) return of(void 0);

    if (this.hasValidAccessToken()) {
      return this.me().pipe(
        switchMap(() => this.loadPermissionCatalog()),
        map(() => void 0),
        catchError((err) => this.tryRefreshAndMe(err))
      );
    }

    if (!hasRefresh) {
      this.clearSession();
      return of(void 0);
    }

    return this.refreshAccessToken().pipe(
      switchMap(() => this.me()),
      switchMap(() => this.loadPermissionCatalog()),
      map(() => void 0),
      catchError((err) => {
        if (this.shouldClearSessionForAuthError(err)) {
          this.clearSession();
        }
        return of(void 0);
      })
    );
  }

  ensureAuthenticated(): Observable<boolean> {
    if (this.hasValidAccessToken() && !!this.userSig()) return of(true);
    if (this.hasValidAccessToken()) {
      return this.me().pipe(
        switchMap(() => this.loadPermissionCatalog()),
        map(() => true),
        catchError((err) => this.refreshAndReturnBool(err))
      );
    }
    if (!this.getRefreshToken()) return of(false);
    return this.refreshAccessToken().pipe(
      switchMap(() => this.me()),
      switchMap(() => this.loadPermissionCatalog()),
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
    this.permissionCatalogSig.set([]);
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
    const user = res.user
      ? {
          id: String(res.user.id),
          name: String(res.user.name || '').trim(),
          email: String(res.user.email),
          roles:
            this.normalizeRoles(res.user.roles).length
              ? this.normalizeRoles(res.user.roles)
              : this.extractRolesFromToken(accessToken),
          permissions:
            this.normalizePermissions(res.user.permissions).length
              ? this.normalizePermissions(res.user.permissions)
              : this.extractPermissionsFromToken(accessToken),
        }
      : null;

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
      const rawUser = userRaw ? (JSON.parse(userRaw) as Partial<AuthUser>) : null;
      const user = rawUser
        ? {
            id: String(rawUser.id || ''),
            name: String(rawUser.name || '').trim(),
            email: String(rawUser.email || ''),
            roles: this.normalizeRoles(rawUser.roles).length
              ? this.normalizeRoles(rawUser.roles)
              : this.extractRolesFromToken(accessToken || ''),
            permissions: this.normalizePermissions(rawUser.permissions).length
              ? this.normalizePermissions(rawUser.permissions)
              : this.extractPermissionsFromToken(accessToken || ''),
          }
        : null;

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

  loadPermissionCatalog(): Observable<PermissionCatalogItem[]> {
    return this.http
      .get<PermissionCatalogItem[]>(`${this.authBase()}/permissions/catalog`)
      .pipe(
        map((items) =>
          [...(items || [])]
            .map((item) => ({
              code: String(item?.code || '').trim().toUpperCase(),
              label: String(item?.label || '').trim(),
              description: String(item?.description || '').trim(),
            }))
            .filter((item) => item.code)
        ),
        tap((items) => this.permissionCatalogSig.set(items)),
        catchError(() => {
          this.permissionCatalogSig.set([]);
          return of([]);
        })
      );
  }

  private jwtExp(token: string): number | null {
    const data = this.jwtPayload(token);
    const exp = Number(data?.exp);
    return Number.isFinite(exp) ? exp : null;
  }

  private jwtPayload(token: string): any | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private extractRolesFromToken(token: string): string[] {
    const payload = this.jwtPayload(token);
    if (!payload || typeof payload !== 'object') return [];

    const direct = this.normalizeRoles(payload['roles']);
    if (direct.length) return direct;

    const role = this.normalizeRoles(payload['role']);
    if (role.length) return role;

    const authorities = this.normalizeRoles(payload['authorities']);
    if (authorities.length) return authorities;

    const realm = payload['realm_access'];
    if (realm && typeof realm === 'object') {
      const realmRoles = this.normalizeRoles((realm as Record<string, unknown>)['roles']);
      if (realmRoles.length) return realmRoles;
    }

    return [];
  }

  private extractPermissionsFromToken(token: string): string[] {
    const payload = this.jwtPayload(token);
    if (!payload || typeof payload !== 'object') return [];

    const direct = this.normalizePermissions(payload['permissions']);
    if (direct.length) return direct;

    const scopes = this.normalizePermissions(payload['scope'] ?? payload['scopes']);
    if (scopes.length) return scopes;

    const authorities = this.normalizePermissions(payload['authorities']);
    if (authorities.length) return authorities;

    return [];
  }

  private normalizeRoles(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .map((v) => this.normalizeRoleToken(v));
    }
    if (typeof value === 'string') {
      const parts = value
        .split(/[,\s]+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => this.normalizeRoleToken(v));
      return parts;
    }
    return [];
  }

  private normalizePermissions(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .map((v) => v.toUpperCase());
    }
    if (typeof value === 'string') {
      return value
        .split(/[,\s]+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => v.toUpperCase());
    }
    return [];
  }

  private normalizeRoleToken(value: string): string {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return raw;
    if (raw.startsWith('ROLE_')) return raw.slice(5);
    return raw;
  }

  private applyUser(user: AuthUser | null) {
    if (!user) {
      this.userSig.set(null);
      this.persistStorage();
      return;
    }
    const token = this.getAccessToken() || '';
    const roles = this.normalizeRoles(user.roles);
    const permissions = this.normalizePermissions(user.permissions);
    this.userSig.set({
      id: String(user.id || ''),
      name: String(user.name || '').trim(),
      email: String(user.email || ''),
      roles: roles.length ? roles : this.extractRolesFromToken(token),
      permissions: permissions.length ? permissions : this.extractPermissionsFromToken(token),
    });
    this.persistStorage();
  }

  private tryRefreshAndMe(error: unknown): Observable<void> {
    const err = error as HttpErrorResponse;
    if (err?.status !== 401 || !this.getRefreshToken()) {
      if (this.shouldClearSessionForAuthError(err)) {
        this.clearSession();
      }
      return of(void 0);
    }
    return this.refreshAccessToken().pipe(
      switchMap(() => this.me()),
      switchMap(() => this.loadPermissionCatalog()),
      map(() => void 0),
      catchError((refreshErr) => {
        if (this.shouldClearSessionForAuthError(refreshErr)) {
          this.clearSession();
        }
        return of(void 0);
      })
    );
  }

  private refreshAndReturnBool(error: unknown): Observable<boolean> {
    const err = error as HttpErrorResponse;
    if (err?.status !== 401 || !this.getRefreshToken()) return of(false);
    return this.refreshAccessToken().pipe(
      switchMap(() => this.me()),
      switchMap(() => this.loadPermissionCatalog()),
      map(() => true),
      catchError((refreshErr) => {
        if (this.shouldClearSessionForAuthError(refreshErr)) {
          this.clearSession();
        }
        return of(false);
      })
    );
  }

  private shouldClearSessionForAuthError(error: unknown): boolean {
    const status = (error as HttpErrorResponse)?.status ?? 0;
    return status === 401 || status === 403;
  }

  private onStorageSync = (event: StorageEvent): void => {
    if (event.storageArea !== localStorage) return;
    if (event.key && !this.authStorageKeys.has(event.key)) return;
    this.restoreFromStorage();
  };
}
