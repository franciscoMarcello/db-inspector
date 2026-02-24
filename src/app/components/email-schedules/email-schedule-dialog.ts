import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DbInspectorService } from '../../services/db-inspector.service';

export interface EmailScheduleData {
  sql: string;
  to?: string;
  cc?: string;
  subject?: string;
  time?: string;
  days?: string[];
}

export interface EmailScheduleResult extends Required<EmailScheduleData> {
  sql: string;
  to: string;
  cc: string;
  subject: string;
  time: string;
  days: string[];
}

const DAYS = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
];

@Component({
  selector: 'app-email-schedule-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './email-schedule-dialog.html',
  styleUrls: ['./email-schedule-dialog.css'],
})
export class EmailScheduleDialogComponent {
  sql = '';
  toInput = '';
  ccInput = '';
  toChips: string[] = [];
  ccChips: string[] = [];
  subject = '';
  time = '08:00';
  days: Set<string> = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
  sqlExpanded = false;

  readonly daysOptions = DAYS;
  sendingTest = false;
  recipientError = '';
  ccError = '';
  readonly maxRecipients = 30;
  readonly browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  readonly isEditMode: boolean;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: EmailScheduleData,
    private dialogRef: MatDialogRef<EmailScheduleDialogComponent, EmailScheduleResult>,
    private snackBar: MatSnackBar,
    private api: DbInspectorService
  ) {
    this.isEditMode = Boolean(data?.subject || data?.to || data?.cc || data?.days?.length);
    this.sql = (data?.sql || '').trim();
    this.toChips = this.parseEmails(data?.to || '');
    this.ccChips = this.parseEmails(data?.cc || '');
    this.subject = data?.subject || '';
    this.time = data?.time || '08:00';
    if (data?.days?.length) {
      this.days = new Set(data.days);
    }
  }

  toggleDay(dayId: string) {
    if (this.days.has(dayId)) {
      this.days.delete(dayId);
    } else {
      this.days.add(dayId);
    }
  }

  get canSave(): boolean {
    return Boolean(
      this.sql.trim() &&
        this.toChips.length &&
        this.subject.trim() &&
        this.time &&
        this.days.size &&
        !this.recipientError &&
        !this.ccError
    );
  }

  get canSendTest(): boolean {
    return this.toChips.length > 0 && !this.recipientError;
  }

  get modalTitle(): string {
    return this.isEditMode ? 'Editar agendamento por SQL' : 'Criar agendamento por SQL';
  }

  get sqlSnippet(): string {
    const lines = this.sql.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return 'Sem SQL definido.';
    const first = lines[0];
    return first.length > 140 ? `${first.slice(0, 140)}...` : first;
  }

  get nextRunPreview(): string {
    const next = this.calculateNextRunDate();
    if (!next) return '-';
    const date = next.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date.replace('.', '')} às ${time}`;
  }

  get nextRunRelative(): string {
    const next = this.calculateNextRunDate();
    if (!next) return '';
    const diffMs = next.getTime() - Date.now();
    if (diffMs <= 0) return 'agora';
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `em ${days}d ${hours}h`;
    if (hours > 0) return `em ${hours}h ${minutes}min`;
    return `em ${minutes}min`;
  }

  get currentDayPreset(): 'workdays' | 'everyday' | 'weekend' | 'custom' {
    const has = (d: string) => this.days.has(d);
    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const all = [...weekdays, 'sat', 'sun'];
    const weekend = ['sat', 'sun'];
    if (weekdays.every(has) && this.days.size === weekdays.length) return 'workdays';
    if (all.every(has) && this.days.size === all.length) return 'everyday';
    if (weekend.every(has) && this.days.size === weekend.length) return 'weekend';
    return 'custom';
  }

  cancel() {
    this.dialogRef.close();
  }

  sendTest() {
    this.flushPendingInputs();
    if (!this.canSendTest) {
      this.snackBar.open('Informe ao menos um destinatário para enviar o teste.', 'OK', {
        duration: 1800,
      });
      return;
    }

    this.sendingTest = true;
    this.api
      .sendEmailTest({
        to: this.toChips.join(','),
        cc: this.ccChips.join(','),
        subject: this.subject.trim() || 'Teste de agendamento',
        message: 'Este é um e-mail de teste do agendamento de SQL.',
      })
      .subscribe({
        next: () => {
          this.snackBar.open(`Teste enviado para ${this.toChips.length} destinatário(s).`, 'OK', { duration: 2000 });
        },
        error: () => {
          this.snackBar.open('Falha ao enviar teste.', 'OK', { duration: 2000 });
        },
      })
      .add(() => (this.sendingTest = false));
  }

  save() {
    this.flushPendingInputs();
    if (!this.canSave) return;
    const payload: EmailScheduleResult = {
      sql: this.sql.trim(),
      to: this.toChips.join(','),
      cc: this.ccChips.join(','),
      subject: this.subject.trim(),
      time: this.time,
      days: Array.from(this.days),
    };
    this.dialogRef.close(payload);
  }

  toggleSqlExpanded() {
    this.sqlExpanded = !this.sqlExpanded;
  }

  applyDayPreset(preset: 'workdays' | 'everyday' | 'weekend') {
    if (preset === 'workdays') {
      this.days = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
      return;
    }
    if (preset === 'everyday') {
      this.days = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      return;
    }
    this.days = new Set(['sat', 'sun']);
  }

  addToChipFromInput() {
    this.consumeInputToChips('to');
  }

  addCcChipFromInput() {
    this.consumeInputToChips('cc');
  }

  onChipInputKeydown(event: KeyboardEvent, target: 'to' | 'cc') {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === 'Tab') {
      event.preventDefault();
      this.consumeInputToChips(target);
      return;
    }
    if (event.key === 'Backspace') {
      const input = target === 'to' ? this.toInput : this.ccInput;
      const chips = target === 'to' ? this.toChips : this.ccChips;
      if (!input && chips.length) chips.pop();
    }
  }

  onChipInputPaste(event: ClipboardEvent, target: 'to' | 'cc') {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!pasted) return;
    event.preventDefault();
    this.consumeRawEmails(pasted, target);
  }

  removeChip(target: 'to' | 'cc', index: number) {
    const list = target === 'to' ? this.toChips : this.ccChips;
    list.splice(index, 1);
  }

  private consumeInputToChips(target: 'to' | 'cc') {
    const input = target === 'to' ? this.toInput : this.ccInput;
    this.consumeRawEmails(input, target);
    if (target === 'to') this.toInput = '';
    else this.ccInput = '';
  }

  private consumeRawEmails(raw: string, target: 'to' | 'cc') {
    const emails = this.parseEmails(raw);
    if (!emails.length) return;

    const invalid = emails.find((email) => !this.isValidEmail(email));
    if (invalid) {
      this.setRecipientError(target, `E-mail inválido: ${invalid}`);
      return;
    }
    this.setRecipientError(target, '');

    const list = target === 'to' ? this.toChips : this.ccChips;
    for (const email of emails) {
      if (list.includes(email)) continue;
      if (list.length >= this.maxRecipients) {
        this.setRecipientError(target, `Limite de ${this.maxRecipients} destinatários.`);
        return;
      }
      list.push(email);
    }
  }

  private flushPendingInputs() {
    this.consumeInputToChips('to');
    this.consumeInputToChips('cc');
  }

  private parseEmails(raw: string): string[] {
    return String(raw || '')
      .split(/[,\s;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private setRecipientError(target: 'to' | 'cc', message: string) {
    if (target === 'to') this.recipientError = message;
    else this.ccError = message;
  }

  private calculateNextRunDate(): Date | null {
    if (!this.time || !this.days.size) return null;
    const [hoursRaw, minutesRaw] = this.time.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

    const weekdayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const now = new Date();
    for (let offset = 0; offset < 8; offset++) {
      const candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(hours, minutes, 0, 0);
      const dayCode = weekdayMap[candidate.getDay()];
      if (!this.days.has(dayCode)) continue;
      if (candidate <= now) continue;
      return candidate;
    }
    return null;
  }
}
