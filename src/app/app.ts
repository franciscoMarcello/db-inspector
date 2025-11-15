import {
  Component,
  ViewChild,
  AfterViewInit,
  inject,
  computed,
  signal,
  HostBinding,
} from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { ModalComponent } from './components/modal/modal.component';
import { EnvStorageService, EnvConfig } from './services/env-storage.service';
import { MatIconModule } from '@angular/material/icon';

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

  activeName = signal(this.storage.getActive()?.name ?? '');
  get activeNameValue() {
    return this.activeName();
  }
  theme: 'light' | 'dark' = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';

  @HostBinding('class.dark-theme')
  get isDarkTheme() {
    return this.theme === 'dark';
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.theme);
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
