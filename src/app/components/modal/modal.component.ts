import {
  Component,
  EventEmitter,
  Output,
  ViewChild,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { EnvStorageService, EnvConfig } from '../../services/env-storage.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgIf, NgFor],
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.css'],
})
export class ModalComponent {
  @ViewChild('dlg') dlg!: ElementRef<HTMLDialogElement>;

  @Output() saved = new EventEmitter<EnvConfig>(); // emite último salvo/ativo

  private fb = inject(FormBuilder).nonNullable;
  private storage = inject(EnvStorageService);

  list = signal<EnvConfig[]>(this.storage.all());
  activeId = signal<string | null>(this.storage.getActive()?.id ?? null);

  editing: EnvConfig | null = null;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/[^\s/$.?#].[^\s]*$/i)]],
    apiKey: ['', [Validators.required]],
  });

  open() {
    this.refresh();
    this.dlg.nativeElement.showModal();
  }
  close() {
    this.dlg.nativeElement.close();
  }

  startAdd() {
    this.editing = null;
    this.form.reset();
  }
  startEdit(item: EnvConfig) {
    this.editing = item;
    this.form.setValue({ name: item.name, url: item.url, apiKey: item.apiKey });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue(); // agora v: { name: string; url: string; apiKey: string }
    const saved = this.storage.upsert({ id: this.editing?.id, ...v });
    this.refresh();
    this.saved.emit(saved);
  }

  remove(item: EnvConfig) {
    this.storage.remove(item.id);
    this.refresh();
  }

  private refresh() {
    this.list.set(this.storage.all());
    const act = this.storage.getActive(); // <- retorna EnvConfig | null
    this.activeId.set(act ? act.id : null); // <- SEM 'unknown'
  }

  setActive(item: EnvConfig) {
    this.storage.setActive(item.id);
    this.refresh(); // força re-render, mostra/esconde "Ativar" corretamente
    this.saved.emit(item);
  }
}
