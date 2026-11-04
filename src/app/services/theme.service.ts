import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { OverlayContainer } from '@angular/cdk/overlay';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
export const DARK_THEME_CLASS = 'dark-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);
  private overlay = inject(OverlayContainer);

  readonly theme = signal<Theme>(this.readStored());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    this.apply(theme);
  }

  private readStored(): Theme {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  }

  // Dialogos e menus abrem no container de overlay do CDK, fora do shell do app.
  private apply(theme: Theme): void {
    const dark = theme === 'dark';
    this.document.body.classList.toggle(DARK_THEME_CLASS, dark);
    this.overlay.getContainerElement().classList.toggle(DARK_THEME_CLASS, dark);
  }
}
