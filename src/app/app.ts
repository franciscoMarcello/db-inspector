import { Component, ViewChild, AfterViewInit, inject, computed, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { ModalComponent } from './components/modal/modal.component';
import { EnvStorageService, EnvConfig } from './services/env-storage.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    RouterOutlet,
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
})
export class App implements AfterViewInit {
  @ViewChild('envModal') envModal!: ModalComponent;
  private storage = inject(EnvStorageService);

  activeName = signal(this.storage.getActive()?.name ?? '');

  ngAfterViewInit(): void {
    if (!this.storage.getActive()) {
      // força o usuário a criar/ativar pelo menos um
      queueMicrotask(() => this.envModal.open());
    }
  }
  openEnv() {
    this.envModal.open();
  }
  onSaved(cfg: EnvConfig) {
    this.activeName.set(cfg.name); // ou o que você quiser atualizar
  }
}
