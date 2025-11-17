import { Component, ViewChild, AfterViewInit, inject, signal, HostBinding } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { ModalComponent } from './components/modal/modal.component';
import { EnvStorageService, EnvConfig } from './services/env-storage.service';
import { MatIconModule } from '@angular/material/icon';
import { OverlayContainer } from '@angular/cdk/overlay'; // <-- ADICIONA ISSO

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
    ModalComponent,
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
export class App implements AfterViewInit {
  @ViewChild('envModal') envModal!: ModalComponent;

  private storage = inject(EnvStorageService);
  private overlay = inject(OverlayContainer); // <-- INJETADO

  activeName = signal(this.storage.getActive()?.name ?? '');
  get activeNameValue() {
    return this.activeName();
  }

  theme: 'light' | 'dark' = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';

  @HostBinding('class.dark-theme')
  get isDarkTheme() {
    return this.theme === 'dark';
  }

  constructor() {
    // aplica tema logo na inicialização (body + overlay)
    this.applyTheme(this.theme);
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

  ngAfterViewInit(): void {
    if (!this.storage.getActive()) {
      queueMicrotask(() => this.envModal.open());
    }
  }

  openEnv() {
    this.envModal.open();
  }

  onSaved(cfg: EnvConfig) {
    this.activeName.set(cfg.name);
  }
}
