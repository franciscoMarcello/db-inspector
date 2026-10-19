import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, from, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';
import Keycloak from 'keycloak-js';
import { EnvStorageService } from './env-storage.service';

export type KeycloakClientConfig = {
  url: string;
  realm: string;
  clientId: string;
};

/** GET /api/auth/config: como entrar. Sem keycloak, so o login local. */
export type AuthConfig = {
  localLoginEnabled: boolean;
  keycloak: KeycloakClientConfig | null;
};

/** Parte do keycloak-js usada aqui. A fabrica existe para os testes trocarem por um duble. */
export type KeycloakClient = Pick<
  Keycloak,
  'init' | 'login' | 'logout' | 'updateToken' | 'token' | 'onTokenExpired' | 'authenticated'
>;

export const KEYCLOAK_FACTORY = new InjectionToken<(config: KeycloakClientConfig) => KeycloakClient>(
  'KEYCLOAK_FACTORY',
  { providedIn: 'root', factory: () => (config: KeycloakClientConfig) => new Keycloak(config) }
);

const LOCAL_ONLY_CONFIG: AuthConfig = { localLoginEnabled: true, keycloak: null };
const CONFIG_TIMEOUT_MS = 5000;
const KEYCLOAK_INIT_TIMEOUT_MS = 10000;

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
/** Origem da sessao guardada: as outras abas precisam saber se renovam pelo Keycloak ou pelo refresh local. */
const SSO_KEY = 'auth.sso';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);
  private router = inject(Router);
  private keycloakFactory = inject(KEYCLOAK_FACTORY);

  private keycloak: KeycloakClient | null = null;
  private initPromise: Promise<void> | null = null;
  private configSig = signal<AuthConfig>(LOCAL_ONLY_CONFIG);
  private configErrorSig = signal(false);
  private ssoSessionSig = signal(false);
  private ssoErrorSig = signal('');

  readonly localLoginEnabled = computed(() => this.configSig().localLoginEnabled);
  readonly ssoEnabled = computed(() => !!this.configSig().keycloak);
  /** Backend sem resposta ao abrir: a forma de entrar e desconhecida ate recarregar. */
  readonly configError = computed(() => this.configErrorSig());
  /** Motivo de o login pelo Keycloak nao ter se completado (ex.: e-mail nao verificado). */
  readonly ssoError = computed(() => this.ssoErrorSig());

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
    SSO_KEY,
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

  /** Sessao do Keycloak renova pelo keycloak-js; a local, pelo refresh token. */
  canRefresh(): boolean {
    return this.ssoSessionSig() || !!this.refreshTokenSig();
  }

  /**
   * Roda antes da primeira navegacao (provideAppInitializer): le como entrar e, com Keycloak, conclui o
   * retorno do login ou reaproveita a sessao SSO aberta em outro sistema (check-sso silencioso).
   */
  initialize(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.initializeSso();
    return this.initPromise;
  }

  loginWithSso(): Promise<void> {
    if (!this.keycloak) return Promise.resolve();
    this.ssoErrorSig.set('');
    return this.keycloak.login({ redirectUri: `${window.location.origin}/login` });
  }

  private async initializeSso(): Promise<void> {
    const config = await this.fetchConfig();
    this.configSig.set(config);
    if (!config.keycloak) {
      // Sem cliente Keycloak (desligado ou /config sem resposta), uma sessao SSO guardada nao tem como ser
      // renovada: descarta e deixa a tela de login mostrar o motivo.
      if (this.ssoSessionSig()) this.clearSession();
      return;
    }

    const keycloak = this.keycloakFactory(config.keycloak);
    keycloak.onTokenExpired = () => {
      // So a sessao SSO vigente: depois de uma recusa ou de um login local, ou de um init() que terminou
      // depois do limite, o keycloak-js nao pode sobrescrever o token da sessao atual.
      if (!this.ssoSessionSig()) return;
      // A origem e conferida de novo ao terminar: outra aba pode ter feito login local durante a espera.
      this.refreshSsoToken()
        .then(() => {
          if (this.ssoSessionSig()) this.reloadSsoUser();
        })
        .catch(() => {
          if (this.ssoSessionSig()) this.endSsoSession();
        });
    };
    this.keycloak = keycloak;

    let authenticated = false;
    try {
      // O check-sso silencioso espera uma mensagem do iframe sem prazo proprio: sem limite, a aplicacao
      // nao abriria nem a tela de login.
      authenticated = await this.withTimeout(
        keycloak.init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          checkLoginIframe: false,
          silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        }),
        KEYCLOAK_INIT_TIMEOUT_MS
      );
    } catch {
      this.ssoErrorSig.set('Nao foi possivel conectar ao Keycloak. Tente novamente em instantes.');
    }

    if (!authenticated) {
      // Sem login local, uma sessao local guardada nao vale mais no backend; e uma sessao SSO guardada
      // sem sessao no Keycloak nao tem como ser renovada.
      if (!config.localLoginEnabled || this.ssoSessionSig()) this.clearSession();
      return;
    }

    this.applySsoToken();
    const token = this.getAccessToken();
    try {
      const user = await firstValueFrom(this.http.get<AuthUser>(`${this.authBase()}/me`));
      // Outra aba pode ter feito login local enquanto o /me estava pendente: a resposta nao e dela.
      if (!this.isSameSsoSession(token)) return;
      this.applyUser(user);
      await firstValueFrom(this.loadPermissionCatalog());
    } catch (err) {
      if (!this.isSameSsoSession(token)) return;
      this.setSsoRejection(err as HttpErrorResponse);
      this.clearSession();
    }
  }

  private isSameSsoSession(token: string | null): boolean {
    return this.ssoSessionSig() && this.getAccessToken() === token;
  }

  private setSsoRejection(err: HttpErrorResponse) {
    if (err?.status === 401 || err?.status === 403) {
      this.ssoErrorSig.set(err?.error?.message || 'O AgroReport recusou o login pelo Keycloak.');
    }
  }

  private fetchConfig(): Promise<AuthConfig> {
    return firstValueFrom(
      this.http.get<AuthConfig>(`${this.authBase()}/config`).pipe(
        timeout(CONFIG_TIMEOUT_MS),
        map((config) => ({
          localLoginEnabled: config?.localLoginEnabled !== false,
          keycloak:
            config?.keycloak?.url && config.keycloak.realm && config.keycloak.clientId
              ? config.keycloak
              : null,
        })),
        catchError(() => {
          this.configErrorSig.set(true);
          return of(LOCAL_ONLY_CONFIG);
        })
      )
    );
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo esgotado')), ms);
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
  }

  /** Permissoes podem ter mudado no backend desde o login: renovar o token renova tambem o usuario. */
  private reloadSsoUser() {
    // A resposta so vale para a sessao que fez a pergunta: se outra aba trocou de sessao (ou o token foi
    // renovado de novo) enquanto isso, ela e descartada.
    const token = this.getAccessToken();
    this.http.get<AuthUser>(`${this.authBase()}/me`).subscribe({
      next: (user) => {
        if (this.isSameSsoSession(token)) this.applyUser(user);
      },
      error: (err: HttpErrorResponse) => {
        if (this.isSameSsoSession(token) && (err?.status === 401 || err?.status === 403)) {
          // Guarda o motivo antes de sair: a tela de login mostra e oferece entrar com outra conta.
          this.setSsoRejection(err);
          this.endSsoSession();
        }
      },
    });
  }

  /** A tela atual nao passa de novo pelos guards: sem sessao, volta para o login. */
  private endSsoSession() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  private applySsoToken() {
    const token = this.keycloak?.token;
    if (!token) return;
    // Vindo de uma sessao local, o usuario guardado e de outra identidade: some ate o /me responder, para
    // as outras abas nao receberem o token SSO com os perfis do usuario anterior.
    if (!this.ssoSessionSig()) this.userSig.set(null);
    this.ssoSessionSig.set(true);
    this.accessTokenSig.set(token);
    this.refreshTokenSig.set(null);
    this.tokenTypeSig.set('Bearer');
    this.expiresAtSig.set(this.jwtExp(token) ?? 0);
    this.persistStorage();
  }

  private async refreshSsoToken(): Promise<void> {
    const keycloak = this.keycloak;
    if (keycloak?.authenticated) {
      await keycloak.updateToken(30);
      // Outra aba pode ter trocado para uma sessao local durante a espera: nao sobrescreve.
      if (this.ssoSessionSig()) this.applySsoToken();
      return;
    }
    // Sessao recebida de outra aba: o refresh token fica no keycloak-js de la, que grava o token renovado
    // no localStorage. Usa o mais recente. Vale ate vencer de fato: a outra aba so renova no vencimento, e a
    // folga de 30s do hasValidAccessToken mandaria esta aba ao login antes disso.
    this.restoreFromStorage();
    const exp = this.jwtExp(this.accessTokenSig() ?? '');
    if (!this.ssoSessionSig() || !exp || exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Sessao SSO sem renovacao nesta aba.');
    }
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
    return this.http.get<AuthUser>(`${this.authBase()}/me`).pipe(
      tap((u) => this.applyUser(u)),
      catchError((err: HttpErrorResponse) => {
        if (this.ssoSessionSig()) this.setSsoRejection(err);
        return throwError(() => err);
      })
    );
  }

  bootstrapSession(): Observable<void> {
    // A sessao SSO ja foi carregada em initialize().
    if (this.ssoSessionSig() && this.userSig()) return of(void 0);
    const hasAccess = !!this.getAccessToken();
    const hasRefresh = this.canRefresh();
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
    if (!this.canRefresh()) return of(false);
    return this.refreshAccessToken().pipe(
      switchMap(() => this.me()),
      switchMap(() => this.loadPermissionCatalog()),
      map(() => true),
      catchError(() => of(false))
    );
  }

  refreshAccessToken(): Observable<void> {
    if (this.ssoSessionSig()) {
      return from(this.refreshSsoToken()).pipe(
        catchError(() =>
          throwError(
            () => new HttpErrorResponse({ status: 401, statusText: 'Sessao do Keycloak expirada' })
          )
        )
      );
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return throwError(() => new Error('Sem refresh token.'));

    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http
        .post<AuthLoginResponse>(`${this.authBase()}/refresh`, { refreshToken })
        .pipe(
          tap((res) => this.setSession(res)),
          finalize(() => {
            this.refreshInFlight$ = null;
          }),
          shareReplay(1)
        );
    }

    return this.refreshInFlight$.pipe(map(() => void 0));
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(`${this.authBase()}/password-reset/request`, { email });
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.authBase()}/password-reset/confirm`, { token, newPassword });
  }

  logout(): Observable<void> {
    const keycloak = this.keycloak;
    const sso = this.ssoSessionSig();
    const refreshToken = this.getRefreshToken();
    // Sessao local: revoga o refresh token no backend, mesmo que o Keycloak tambem esteja logado.
    const local$ =
      !sso && refreshToken
        ? this.http
            .post<void>(`${this.authBase()}/logout`, { refreshToken })
            .pipe(catchError(() => of(void 0)))
        : of(void 0);

    return local$.pipe(
      tap(() => this.clearSession()),
      // Sai do Keycloak tambem (senao o check-sso entraria de novo na hora), inclusive quando a conta foi
      // recusada pelo backend e so a sessao do Keycloak sobrou.
      switchMap(() =>
        keycloak && (sso || keycloak.authenticated)
          ? from(keycloak.logout({ redirectUri: `${window.location.origin}/login` })).pipe(
              catchError(() => of(void 0))
            )
          : of(void 0)
      )
    );
  }

  clearSession() {
    this.ssoSessionSig.set(false);
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
      const sso = localStorage.getItem(SSO_KEY) === '1' && !!accessToken;
      const rawUser = userRaw ? (JSON.parse(userRaw) as Partial<AuthUser>) : null;
      // Sessao SSO: perfis e permissoes so do /me; as claims do token Keycloak (roles de realm e de outros
      // clients) nao valem aqui.
      const user = rawUser
        ? {
            id: String(rawUser.id || ''),
            name: String(rawUser.name || '').trim(),
            email: String(rawUser.email || ''),
            roles:
              sso || this.normalizeRoles(rawUser.roles).length
                ? this.normalizeRoles(rawUser.roles)
                : this.extractRolesFromToken(accessToken || ''),
            permissions:
              sso || this.normalizePermissions(rawUser.permissions).length
                ? this.normalizePermissions(rawUser.permissions)
                : this.extractPermissionsFromToken(accessToken || ''),
          }
        : null;

      this.ssoSessionSig.set(sso);
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

      if (this.ssoSessionSig()) localStorage.setItem(SSO_KEY, '1');
      else localStorage.removeItem(SSO_KEY);
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
      localStorage.removeItem(SSO_KEY);
    } catch {
      // ignore storage failures
    }
  }

  private authBase(): string {
    const backend = this.env.getActive()?.backend?.trim() || '/api/db';
    return backend.replace(/\/api\/db\/?$/i, '/api/auth');
  }

  private adminBase(): string {
    const backend = this.env.getActive()?.backend?.trim() || '/api/db';
    return backend.replace(/\/api\/db\/?$/i, '/api/admin');
  }

  loadPermissionCatalog(): Observable<PermissionCatalogItem[]> {
    return this.http
      .get<PermissionCatalogItem[]>(`${this.adminBase()}/permissions/catalog`)
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
    // Sessao SSO: o /me e a unica fonte, inclusive quando diz que nao ha perfil nenhum.
    const sso = this.ssoSessionSig();
    this.userSig.set({
      id: String(user.id || ''),
      name: String(user.name || '').trim(),
      email: String(user.email || ''),
      roles: sso || roles.length ? roles : this.extractRolesFromToken(token),
      permissions: sso || permissions.length ? permissions : this.extractPermissionsFromToken(token),
    });
    this.persistStorage();
  }

  private tryRefreshAndMe(error: unknown): Observable<void> {
    const err = error as HttpErrorResponse;
    if (err?.status !== 401 || !this.canRefresh()) {
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
    if (err?.status !== 401 || !this.canRefresh()) return of(false);
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
