import { Component, inject, signal, HostBinding } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { EnvStorageService } from './services/env-storage.service';
import { MatIconModule } from '@angular/material/icon';
import { OverlayContainer } from '@angular/cdk/overlay'; // <-- ADICIONA ISSO
import { AuthService } from './services/auth.service';
import packageJson from '../../package.json';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    RouterOutlet,
    MatIconModule,
    RouterLink,
    RouterLinkActive,
  ],
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }
    `,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  private storage = inject(EnvStorageService);
  private overlay = inject(OverlayContainer); // <-- INJETADO
  private auth = inject(AuthService);
  private router = inject(Router);
  appVersion = packageJson.version;

  activeName = signal(this.storage.getActive()?.name ?? 'Produção');
  get activeNameValue() {
    return this.activeName();
  }

  get isLoggedIn() {
    return this.auth.isAuthenticated();
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

  theme: 'light' | 'dark' = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';

  @HostBinding('class.dark-theme')
  get isDarkTheme() {
    return this.theme === 'dark';
  }

  constructor() {
    // aplica tema logo na inicialização (body + overlay)
    this.applyTheme(this.theme);
    this.auth.bootstrapSession().subscribe();
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.theme);
    this.applyTheme(this.theme);
  }

  private applyTheme(theme: 'light' | 'dark') {
    const bodyClasses = document.body.classList;
    const overlayClasses = this.overlay.getContainerElement().classList;

    if (theme === 'dark') {
      bodyClasses.add('dark-theme');
      overlayClasses.add('dark-theme');
    } else {
      bodyClasses.remove('dark-theme');
      overlayClasses.remove('dark-theme');
    }
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
    });
  }
}
