import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type AppButtonTone = 'primary' | 'neutral' | 'danger';
export type AppButtonVariant = 'solid' | 'outline' | 'ghost';
export type AppButtonSize = 'md' | 'sm';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './app-button.component.html',
  styleUrls: ['./app-button.component.css'],
})
export class AppButtonComponent {
  @HostBinding('class.app-button-host') readonly hostClass = true;
  @HostBinding('class.app-button-host--full')
  get hostFullClass(): boolean {
    return this.fullWidth;
  }

  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() tone: AppButtonTone = 'neutral';
  @Input() variant: AppButtonVariant = 'outline';
  @Input() size: AppButtonSize = 'md';
  @Input() icon = '';
  @Input() iconPosition: 'left' | 'right' = 'left';
  @Input() fullWidth = false;
  @Input() ariaLabel = '';

  @Output() pressed = new EventEmitter<MouseEvent>();

  get buttonClasses(): string[] {
    return [
      ...this.baseClasses,
      ...this.sizeClasses,
      ...this.variantToneClasses,
      ...(this.fullWidth ? ['w-full'] : []),
    ];
  }

  get iconClasses(): string[] {
    return this.size === 'sm' ? ['!w-4', '!h-4', '!text-base'] : ['!w-[18px]', '!h-[18px]', '!text-[18px]'];
  }

  private get baseClasses(): string[] {
    return [
      'inline-flex',
      'items-center',
      'justify-center',
      'gap-1.5',
      'border',
      'border-solid',
      'border-transparent',
      'rounded-[10px]',
      'font-semibold',
      'transition-[background-color,border-color,color,filter]',
      'duration-150',
      'ease-in-out',
      'disabled:opacity-[0.55]',
      'disabled:cursor-not-allowed',
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-offset-1',
      'focus-visible:outline-[var(--chip-bg-active)]',
    ];
  }

  private get sizeClasses(): string[] {
    if (this.size === 'sm') {
      return ['min-h-8', 'px-2.5', 'text-xs'];
    }
    return ['min-h-9', 'px-3.5', 'text-sm'];
  }

  private get variantToneClasses(): string[] {
    const key = `${this.tone}:${this.variant}`;
    switch (key) {
      case 'primary:solid':
        return [
          'bg-[var(--chip-bg-active)]',
          'border-[var(--chip-bg-active)]',
          'text-white',
          'hover:enabled:brightness-105',
        ];
      case 'neutral:outline':
        return [
          'bg-[var(--bg-surface-alt)]',
          'border-[var(--border-subtle)]',
          'text-[var(--text-primary)]',
          'hover:enabled:bg-[color-mix(in_srgb,var(--bg-surface-alt)_76%,var(--chip-bg-active))]',
        ];
      case 'danger:outline':
        return [
          'bg-[rgba(239,68,68,0.08)]',
          'border-[rgba(239,68,68,0.45)]',
          'text-[#ef4444]',
          'hover:enabled:bg-[rgba(239,68,68,0.16)]',
        ];
      case 'neutral:ghost':
        return [
          'bg-transparent',
          'border-transparent',
          'text-[var(--text-muted)]',
          'hover:enabled:text-[var(--text-primary)]',
          'hover:enabled:bg-[rgba(148,163,184,0.16)]',
        ];
      default:
        return ['bg-[var(--bg-surface-alt)]', 'border-[var(--border-subtle)]', 'text-[var(--text-primary)]'];
    }
  }

  onClick(event: MouseEvent): void {
    if (this.disabled) return;
    this.pressed.emit(event);
  }
}
