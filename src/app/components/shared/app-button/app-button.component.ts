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

  @Output() pressed = new EventEmitter<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled) return;
    this.pressed.emit(event);
  }
}
