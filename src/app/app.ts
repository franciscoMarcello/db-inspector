import { Component, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';
import packageJson from '../../package.json';
import { AppButtonComponent } from './components/shared/app-button/app-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatIconModule, AppButtonComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  private themeService = inject(ThemeService);
  private auth = inject(AuthService);
  private router = inject(Router);
  appVersion = packageJson.version;
  sideMenuCollapsed = localStorage.getItem('layout.side_menu_collapsed') === 'true';
  adminMenuExpanded = localStorage.getItem('layout.admin_menu_expanded') !== 'false';

  get isLoggedIn() {
    return this.auth.hasSession();
  }

  get userEmail() {
    return this.auth.user()?.email || '';
  }

  get userName() {
    return String(this.auth.user()?.name || '').trim();
  }

  get userDisplayName() {
    const name = this.userName;
    if (name) return name;

    const email = this.userEmail;
    if (!email) return '';
    const local = email.split('@')[0] || '';
    const normalized = local.replace(/[._-]+/g, ' ').trim();
    if (!normalized) return email;
    return normalized
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  get isAdmin() {
    return this.auth.isAdmin();
  }

  get canManageReports() {
    return this.auth.hasPermission('REPORT_WRITE') || this.auth.isAdmin();
  }

  get canViewSchemas() {
    return this.auth.hasPermission('SQL_METADATA_READ') || this.auth.isAdmin();
  }

  get canExecuteSql() {
    return this.auth.hasPermission('SQL_QUERY_EXECUTE') || this.auth.isAdmin();
  }

  get canViewSchedules() {
    return (
      this.auth.hasPermission('EMAIL_SEND') ||
      this.auth.hasPermission('EMAIL_TEST') ||
      this.auth.hasPermission('EMAIL_SCHEDULE_READ') ||
      this.auth.hasPermission('EMAIL_SCHEDULE_WRITE') ||
      this.auth.isAdmin()
    );
  }

  get theme() {
    return this.themeService.theme();
  }

  constructor() {
    this.auth.bootstrapSession().subscribe();
  }

  toggleTheme() {
    this.themeService.toggle();
  }

  toggleSideMenu() {
    this.sideMenuCollapsed = !this.sideMenuCollapsed;
    localStorage.setItem('layout.side_menu_collapsed', String(this.sideMenuCollapsed));
  }

  toggleAdminMenu() {
    this.adminMenuExpanded = !this.adminMenuExpanded;
    localStorage.setItem('layout.admin_menu_expanded', String(this.adminMenuExpanded));
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  isRoute(path: string, exact = false): boolean {
    const current = this.router.url || '';
    if (exact) return current === path;
    return current === path || current.startsWith(`${path}/`);
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
    });
  }
}
