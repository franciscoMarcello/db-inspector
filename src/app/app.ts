import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-root',
  standalone: true,

  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  template: `
    <mat-toolbar color="primary">
      <span>DB Inspector UI</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/schemas" routerLinkActive="active">Esquemas</a>
      <a mat-button routerLink="/query" routerLinkActive="active">Executar SQL</a>
    </mat-toolbar>

    <router-outlet></router-outlet>
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    a.active { background: rgba(255,255,255,.16); }
    :host { display: block; }
  `]
})
export class App {}
