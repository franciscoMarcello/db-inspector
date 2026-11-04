import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { Component, signal } from '@angular/core';
import { of } from 'rxjs';
import { App } from './app';
import { AuthService } from './services/auth.service';
import { DARK_THEME_CLASS, THEME_STORAGE_KEY } from './services/theme.service';
import { AppButtonComponent } from './components/shared/app-button/app-button.component';

@Component({
  standalone: true,
  imports: [AppButtonComponent],
  template: `<app-button class="page-btn" icon="grid_on">Excel</app-button>`,
})
class PageWithButton {}

interface FakeUser {
  email: string;
  name: string;
}

function fakeAuth(options: { loggedIn: boolean; admin?: boolean; permissions?: string[] }) {
  return {
    user: signal<FakeUser | null>(
      options.loggedIn ? { email: 'ana.souza@gruporovema.com.br', name: 'Ana Souza' } : null,
    ),
    hasSession: () => options.loggedIn,
    isAdmin: () => !!options.admin,
    hasPermission: (p: string) => (options.permissions ?? []).includes(p),
    bootstrapSession: () => of(undefined),
    logout: jasmine.createSpy('logout').and.returnValue(of(undefined)),
  };
}

function render(auth: ReturnType<typeof fakeAuth>, routes: Routes = []) {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [provideRouter(routes), { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function navLabels(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.side-menu app-button.nav-btn .app-btn__label')).map((n) =>
    (n.textContent ?? '')
      .replace(/\s+/g, ' ')
      .replace(/(expand_more|chevron_right)/, '')
      .trim(),
  );
}

describe('App (shell)', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.body.classList.remove(DARK_THEME_CLASS);
  });

  it('sem sessao mostra so a barra com o nome e o botao de tema, sem menu lateral', () => {
    const { el } = render(fakeAuth({ loggedIn: false }));
    expect(el.querySelector('.side-nav')).toBeNull();
    expect(el.querySelector('.top-lite .title')?.textContent).toContain('AgroReport');
    expect(el.querySelector('.top-lite button[aria-label]')).not.toBeNull();
  });

  it('logado mostra o nome AgroReport uma vez so e nenhuma barra de topo', () => {
    const { el } = render(fakeAuth({ loggedIn: true }));
    expect(el.querySelector('.top-lite')).toBeNull();
    const titles = Array.from(el.querySelectorAll('.title')).filter((n) =>
      n.textContent?.includes('AgroReport'),
    );
    expect(titles.length).toBe(1);
  });

  it('usuario sem permissoes ve so Relatorios no menu', () => {
    const { el } = render(fakeAuth({ loggedIn: true }));
    expect(navLabels(el)).toEqual(['Relatórios']);
  });

  it('cada permissao libera o seu item do menu', () => {
    const { el } = render(
      fakeAuth({
        loggedIn: true,
        permissions: [
          'SQL_METADATA_READ',
          'SQL_QUERY_EXECUTE',
          'EMAIL_SCHEDULE_READ',
          'REPORT_WRITE',
        ],
      }),
    );
    expect(navLabels(el)).toEqual([
      'Esquemas',
      'Executar SQL',
      'Agendamentos',
      'Relatórios',
      'Gerenciar relatórios',
    ]);
  });

  it('admin ve o grupo de usuarios com Usuarios e Permissoes', () => {
    localStorage.removeItem('layout.admin_menu_expanded');
    const { el } = render(fakeAuth({ loggedIn: true, admin: true }));
    const labels = navLabels(el);
    expect(labels).toContain('Gerenciar usuários');
    expect(labels).toContain('Usuários');
    expect(labels).toContain('Permissões');
  });

  it('nome e e-mail do usuario ficam no rodape da lateral', () => {
    const { el } = render(fakeAuth({ loggedIn: true }));
    const footer = el.querySelector('.side-footer') as HTMLElement;
    expect(footer.textContent).toContain('Ana Souza');
    expect(footer.textContent).toContain('ana.souza@gruporovema.com.br');
  });

  it('Sair chama o logout e volta para o login', () => {
    const auth = fakeAuth({ loggedIn: true });
    const { el } = render(auth);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const sair = Array.from(el.querySelectorAll<HTMLButtonElement>('.side-footer button')).find(
      (b) => b.textContent?.includes('Sair'),
    );
    sair!.click();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('o botao de tema alterna o tema escuro e troca o proprio nome acessivel', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { fixture, el } = render(fakeAuth({ loggedIn: true }));
    const button = () => el.querySelector<HTMLButtonElement>('.side-top .theme-toggle button')!;

    expect(button().getAttribute('aria-label')).toBe('Usar tema escuro');
    button().click();
    fixture.detectChanges();
    expect(document.body.classList.contains(DARK_THEME_CLASS)).toBeTrue();
    expect(button().getAttribute('aria-label')).toBe('Usar tema claro');
  });

  it('o botao de recolher o menu tem nome acessivel e alterna o estado', () => {
    localStorage.removeItem('layout.side_menu_collapsed');
    const { fixture, el } = render(fakeAuth({ loggedIn: true }));
    const toggle = () => el.querySelector<HTMLButtonElement>('.side-top .collapse-toggle button')!;

    expect(toggle().getAttribute('aria-label')).toBe('Recolher menu');
    toggle().click();
    fixture.detectChanges();
    expect(el.querySelector('.app-shell')?.classList).toContain('side-collapsed');
    expect(toggle().getAttribute('aria-label')).toBe('Expandir menu');
    localStorage.removeItem('layout.side_menu_collapsed');
  });

  it('a rota atual marca o item do menu como ativo', () => {
    const { fixture, el } = render(fakeAuth({ loggedIn: true }));
    spyOnProperty(TestBed.inject(Router), 'url', 'get').and.returnValue('/reports');
    fixture.detectChanges();
    const active = el.querySelector('.side-menu app-button.nav-btn.active .app-btn__label');
    expect(active?.textContent?.trim()).toBe('Relatórios');
  });

  it('menu recolhido esconde so os rotulos da lateral, nunca os botoes da pagina', async () => {
    localStorage.setItem('layout.side_menu_collapsed', 'true');
    const { fixture, el } = render(fakeAuth({ loggedIn: true }), [
      { path: '', component: PageWithButton },
    ]);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    localStorage.removeItem('layout.side_menu_collapsed');

    const navLabel = el.querySelector('.side-menu .app-btn__label') as HTMLElement;
    const pageLabel = el.querySelector('.page app-button.page-btn .app-btn__label') as HTMLElement;
    expect(navLabel.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(pageLabel.getBoundingClientRect().width).toBeGreaterThan(10);
  });
});
