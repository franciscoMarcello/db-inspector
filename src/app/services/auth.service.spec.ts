import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvStorageService } from './env-storage.service';
import { AuthConfig, AuthService, KEYCLOAK_FACTORY, KeycloakClient } from './auth.service';

const SSO_CONFIG: AuthConfig = {
  localLoginEnabled: false,
  keycloak: { url: 'https://sso.exemplo.com.br', realm: 'rovema', clientId: 'agroreports' },
};

const USER = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@rovema.com.br',
  roles: ['ANALISTA'],
  permissions: ['REPORT_READ'],
};

function fakeJwt(expSecondsFromNow: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  // Role de realm com o mesmo nome do perfil de admin: nao pode valer no agroreports.
  const payload = { exp, sub: 'kc-ana', realm_access: { roles: ['ADMIN'] } };
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.assinatura`;
}

class FakeKeycloak {
  token: string | undefined = undefined;
  onTokenExpired: (() => void) | undefined = undefined;
  authenticated = false;

  init = jasmine.createSpy('init').and.callFake(async () => {
    if (this.authenticated) this.token = fakeJwt(300);
    return this.authenticated;
  });
  login = jasmine.createSpy('login').and.resolveTo();
  logout = jasmine.createSpy('logout').and.resolveTo();
  updateToken = jasmine.createSpy('updateToken').and.callFake(async () => {
    this.token = fakeJwt(600);
    return true;
  });
}

describe('AuthService com Keycloak', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let keycloak: FakeKeycloak;
  let factory: jasmine.Spy;

  function configureModule() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EnvStorageService, useValue: { getActive: () => ({ backend: '/api/db' }) } },
        { provide: KEYCLOAK_FACTORY, useValue: factory },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    [
      'auth.access_token',
      'auth.refresh_token',
      'auth.token_type',
      'auth.expires_at',
      'auth.user',
      'auth.sso',
    ].forEach((key) => localStorage.removeItem(key));
    keycloak = new FakeKeycloak();
    factory = jasmine.createSpy('factory').and.returnValue(keycloak as unknown as KeycloakClient);
    configureModule();
  });

  afterEach(() => http.verify());

  function initializeWith(config: AuthConfig | 'erro'): { finished: () => boolean } {
    let finished = false;
    service.initialize().then(() => (finished = true));
    const request = http.expectOne('/api/auth/config');
    if (config === 'erro') {
      request.flush({}, { status: 503, statusText: 'Indisponivel' });
    } else {
      request.flush(config);
    }
    flushMicrotasks();
    return { finished: () => finished };
  }

  function answerMeAndCatalog() {
    http.expectOne('/api/auth/me').flush(USER);
    flushMicrotasks();
    http.expectOne('/api/admin/permissions/catalog').flush([]);
    flushMicrotasks();
  }

  it('sem Keycloak no backend fica so no login local', fakeAsync(() => {
    const init = initializeWith({ localLoginEnabled: true, keycloak: null });

    expect(init.finished()).toBeTrue();
    expect(service.ssoEnabled()).toBeFalse();
    expect(service.localLoginEnabled()).toBeTrue();
    expect(factory).not.toHaveBeenCalled();
  }));

  it('backend fora do ar cai para o login local', fakeAsync(() => {
    const init = initializeWith('erro');

    expect(init.finished()).toBeTrue();
    expect(service.ssoEnabled()).toBeFalse();
    expect(service.localLoginEnabled()).toBeTrue();
    expect(service.configError()).toBeTrue();
  }));

  it('sessao SSO aberta entra direto com o token do Keycloak e o usuario carregado', fakeAsync(() => {
    keycloak.authenticated = true;
    const init = initializeWith(SSO_CONFIG);
    answerMeAndCatalog();

    expect(init.finished()).toBeTrue();
    expect(keycloak.init).toHaveBeenCalledWith(
      jasmine.objectContaining({ onLoad: 'check-sso', pkceMethod: 'S256' }),
    );
    expect(service.getAccessToken()).toBe(keycloak.token ?? null);
    expect(service.getRefreshToken()).toBeNull();
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.canRefresh()).toBeTrue();
    expect(service.user()?.email).toBe(USER.email);
  }));

  it('login recusado pelo backend mostra o motivo e nao deixa sessao', fakeAsync(() => {
    keycloak.authenticated = true;
    const init = initializeWith(SSO_CONFIG);
    http
      .expectOne('/api/auth/me')
      .flush(
        { status: 403, message: 'O Keycloak nao confirmou o e-mail desta conta' },
        { status: 403, statusText: 'Forbidden' },
      );
    flushMicrotasks();

    expect(init.finished()).toBeTrue();
    expect(service.ssoError()).toContain('nao confirmou o e-mail');
    expect(service.hasSession()).toBeFalse();
    expect(service.getAccessToken()).toBeNull();
  }));

  it('sem login local e sem sessao SSO descarta a sessao local guardada', fakeAsync(() => {
    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.user', JSON.stringify(USER));
    TestBed.resetTestingModule();
    configureModule();
    expect(service.getAccessToken()).not.toBeNull();

    initializeWith(SSO_CONFIG);

    expect(service.getAccessToken()).toBeNull();
    expect(service.hasSession()).toBeFalse();
  }));

  it('renovar a sessao SSO usa o keycloak-js e nao o refresh local', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();
    const before = service.getAccessToken();

    service.refreshAccessToken().subscribe();
    flushMicrotasks();

    expect(keycloak.updateToken).toHaveBeenCalled();
    expect(service.getAccessToken()).not.toBe(before);
    http.expectNone('/api/auth/refresh');
  }));

  it('sair da sessao SSO encerra a sessao no Keycloak', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();

    service.logout().subscribe();
    flushMicrotasks();

    expect(keycloak.logout).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/login`,
    });
    expect(service.hasSession()).toBeFalse();
    http.expectNone('/api/auth/logout');
  }));

  it('entrar com SSO volta para a tela de login, que leva ao destino', fakeAsync(() => {
    initializeWith(SSO_CONFIG);

    service.loginWithSso();
    flushMicrotasks();

    expect(keycloak.login).toHaveBeenCalledWith({ redirectUri: `${window.location.origin}/login` });
  }));
  it('conta recusada pelo backend consegue sair do Keycloak para trocar de conta', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    http
      .expectOne('/api/auth/me')
      .flush({ message: 'Usuario desativado' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    service.logout().subscribe();
    flushMicrotasks();

    expect(keycloak.logout).toHaveBeenCalled();
  }));

  it('check-sso sem resposta nao trava a abertura da aplicacao', fakeAsync(() => {
    keycloak.init.and.returnValue(new Promise<boolean>(() => undefined));
    const init = initializeWith(SSO_CONFIG);
    expect(init.finished()).toBeFalse();

    tick(10000);
    flushMicrotasks();

    expect(init.finished()).toBeTrue();
    expect(service.ssoError()).toContain('Keycloak');
    expect(service.hasSession()).toBeFalse();
  }));

  it('na sessao SSO o /me e a unica fonte de perfis, mesmo vazia', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    http.expectOne('/api/auth/me').flush({ ...USER, roles: [], permissions: [] });
    flushMicrotasks();
    http.expectOne('/api/admin/permissions/catalog').flush([]);
    flushMicrotasks();

    expect(service.isAdmin()).toBeFalse();
    expect(service.permissions()).toEqual([]);
  }));

  it('outra aba que recebe a sessao SSO renova pelo Keycloak', fakeAsync(() => {
    initializeWith({ localLoginEnabled: true, keycloak: SSO_CONFIG.keycloak });
    expect(service.canRefresh()).toBeFalse();

    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.user', JSON.stringify({ ...USER, roles: [] }));
    localStorage.setItem('auth.sso', '1');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );

    expect(service.canRefresh()).toBeTrue();
    expect(service.getRefreshToken()).toBeNull();
    expect(service.isAdmin()).toBeFalse();
  }));

  it('renovacao automatica que falha encerra a sessao e volta ao login', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    keycloak.updateToken.and.rejectWith(new Error('sessao encerrada'));

    keycloak.onTokenExpired?.();
    flushMicrotasks();

    expect(service.hasSession()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  }));

  it('renovacao automatica recarrega os perfis do backend', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();

    keycloak.onTokenExpired?.();
    flushMicrotasks();
    http.expectOne('/api/auth/me').flush({ ...USER, permissions: ['REPORT_READ', 'REPORT_RUN'] });

    expect(service.hasPermission('REPORT_RUN')).toBeTrue();
  }));
  it('aba sem sessao no Keycloak renova com o token que a outra aba gravou', fakeAsync(() => {
    initializeWith({ localLoginEnabled: true, keycloak: SSO_CONFIG.keycloak });
    localStorage.setItem('auth.access_token', fakeJwt(20));
    localStorage.setItem('auth.user', JSON.stringify(USER));
    localStorage.setItem('auth.sso', '1');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );

    const renewed = fakeJwt(600);
    localStorage.setItem('auth.access_token', renewed);
    let failed = false;
    service.refreshAccessToken().subscribe({ error: () => (failed = true) });
    flushMicrotasks();

    expect(failed).toBeFalse();
    expect(service.getAccessToken()).toBe(renewed);
    expect(keycloak.updateToken).not.toHaveBeenCalled();
  }));

  it('depois de uma recusa o keycloak-js nao volta a gravar token', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    http
      .expectOne('/api/auth/me')
      .flush({ message: 'Usuario desativado' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    keycloak.onTokenExpired?.();
    flushMicrotasks();

    expect(keycloak.updateToken).not.toHaveBeenCalled();
    expect(service.getAccessToken()).toBeNull();
  }));

  it('logout de sessao local revoga o refresh token mesmo com o Keycloak logado', fakeAsync(() => {
    initializeWith({ localLoginEnabled: true, keycloak: SSO_CONFIG.keycloak });
    service.login('ana@rovema.com.br', 'Senha-123!').subscribe();
    http.expectOne('/api/auth/login').flush({
      tokenType: 'Bearer',
      accessToken: fakeJwt(300),
      expiresInSeconds: 300,
      refreshToken: 'refresh-local',
      user: USER,
    });
    http.expectOne('/api/admin/permissions/catalog').flush([]);
    keycloak.authenticated = true;

    service.logout().subscribe();
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-local' });
    request.flush(null);
    flushMicrotasks();

    expect(keycloak.logout).toHaveBeenCalled();
    expect(service.hasSession()).toBeFalse();
  }));

  it('sem resposta do /config uma sessao SSO guardada e descartada', fakeAsync(() => {
    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.user', JSON.stringify(USER));
    localStorage.setItem('auth.sso', '1');
    TestBed.resetTestingModule();
    configureModule();
    expect(service.canRefresh()).toBeTrue();

    initializeWith('erro');

    expect(service.hasSession()).toBeFalse();
    expect(service.configError()).toBeTrue();
  }));
  it('renovacao do Keycloak que termina depois de um login local nao o sobrescreve', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();
    let finishRenewal: (value: boolean) => void = () => undefined;
    keycloak.updateToken.and.returnValue(
      new Promise<boolean>((resolve) => (finishRenewal = resolve)),
    );

    keycloak.onTokenExpired?.();
    flushMicrotasks();
    const localToken = fakeJwt(300);
    localStorage.setItem('auth.access_token', localToken);
    localStorage.setItem('auth.refresh_token', 'refresh-local');
    localStorage.removeItem('auth.sso');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );
    keycloak.token = fakeJwt(600);
    finishRenewal(true);
    flushMicrotasks();

    expect(service.getAccessToken()).toBe(localToken);
    expect(service.getRefreshToken()).toBe('refresh-local');
    http.expectNone('/api/auth/me');
  }));

  it('aba sem sessao no Keycloak segue com o token gravado enquanto ele nao vence', fakeAsync(() => {
    initializeWith({ localLoginEnabled: true, keycloak: SSO_CONFIG.keycloak });
    const almostExpired = fakeJwt(20);
    localStorage.setItem('auth.access_token', almostExpired);
    localStorage.setItem('auth.user', JSON.stringify(USER));
    localStorage.setItem('auth.sso', '1');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );

    let failed = false;
    service.refreshAccessToken().subscribe({ error: () => (failed = true) });
    flushMicrotasks();

    expect(failed).toBeFalse();
    expect(service.getAccessToken()).toBe(almostExpired);
  }));

  it('trocar de sessao local para SSO nao publica o usuario anterior com o token novo', fakeAsync(() => {
    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.refresh_token', 'refresh-local');
    localStorage.setItem('auth.user', JSON.stringify({ ...USER, email: 'local@rovema.com.br' }));
    TestBed.resetTestingModule();
    configureModule();
    keycloak.authenticated = true;

    initializeWith({ localLoginEnabled: true, keycloak: SSO_CONFIG.keycloak });

    expect(localStorage.getItem('auth.sso')).toBe('1');
    expect(localStorage.getItem('auth.user')).toBeNull();
    expect(service.user()).toBeNull();
    answerMeAndCatalog();
    expect(service.user()?.email).toBe(USER.email);
  }));
  it('resposta atrasada do /me nao mexe numa sessao local que chegou depois', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    keycloak.onTokenExpired?.();
    flushMicrotasks();
    const pendingMe = http.expectOne('/api/auth/me');
    const localUser = { ...USER, email: 'local@rovema.com.br' };
    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.refresh_token', 'refresh-local');
    localStorage.setItem('auth.user', JSON.stringify(localUser));
    localStorage.removeItem('auth.sso');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );
    pendingMe.flush({ message: 'Usuario desativado' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    expect(service.user()?.email).toBe(localUser.email);
    expect(service.getRefreshToken()).toBe('refresh-local');
    expect(navigate).not.toHaveBeenCalled();
  }));
  it('/me inicial que volta depois de um login local em outra aba nao mexe nele', fakeAsync(() => {
    keycloak.authenticated = true;
    const init = initializeWith(SSO_CONFIG);
    const pendingMe = http.expectOne('/api/auth/me');
    const localUser = { ...USER, email: 'local@rovema.com.br' };
    localStorage.setItem('auth.access_token', fakeJwt(300));
    localStorage.setItem('auth.refresh_token', 'refresh-local');
    localStorage.setItem('auth.user', JSON.stringify(localUser));
    localStorage.removeItem('auth.sso');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'auth.sso', storageArea: localStorage }),
    );

    pendingMe.flush({ message: 'Usuario desativado' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    expect(init.finished()).toBeTrue();
    expect(service.user()?.email).toBe(localUser.email);
    expect(service.getRefreshToken()).toBe('refresh-local');
    expect(service.ssoError()).toBe('');
  }));
  it('conta recusada na renovacao volta ao login com o motivo', fakeAsync(() => {
    keycloak.authenticated = true;
    initializeWith(SSO_CONFIG);
    answerMeAndCatalog();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    keycloak.onTokenExpired?.();
    flushMicrotasks();
    http
      .expectOne('/api/auth/me')
      .flush(
        { message: 'Usuario desativado no agroreports' },
        { status: 403, statusText: 'Forbidden' },
      );
    flushMicrotasks();

    expect(service.ssoError()).toBe('Usuario desativado no agroreports');
    expect(service.hasSession()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  }));
});
