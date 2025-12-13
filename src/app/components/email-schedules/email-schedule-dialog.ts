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
  time?: string;
  days?: string[];
}

export interface EmailScheduleResult extends Required<EmailScheduleData> {
  sql: string;
  to: string;
  cc: string;
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
  to = '';
  cc = '';
  time = '08:00';
  days: Set<string> = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);

  readonly daysOptions = DAYS;
  sendingTest = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: EmailScheduleData,
    private dialogRef: MatDialogRef<EmailScheduleDialogComponent, EmailScheduleResult>,
    private snackBar: MatSnackBar,
    private api: DbInspectorService
  ) {
    this.sql = (data?.sql || '').trim();
    this.to = data?.to || '';
    this.cc = data?.cc || '';
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
    return Boolean(this.sql.trim() && this.to.trim() && this.time && this.days.size);
  }

  cancel() {
    this.dialogRef.close();
  }

  sendTest() {
    if (!this.to.trim()) {
      this.snackBar.open('Informe ao menos um destinatário para enviar o teste.', 'OK', {
        duration: 1800,
      });
      return;
    }

    this.sendingTest = true;
    this.api
      .sendEmailTest({
        to: this.to.trim(),
        cc: this.cc.trim(),
        subject: 'Teste de agendamento',
        message: 'Este é um e-mail de teste do agendamento de SQL.',
      })
      .subscribe({
        next: () => {
          this.snackBar.open('Teste enviado com sucesso.', 'OK', { duration: 1800 });
        },
        error: () => {
          this.snackBar.open('Falha ao enviar teste.', 'OK', { duration: 2000 });
        },
      })
      .add(() => (this.sendingTest = false));
  }

  save() {
    if (!this.canSave) return;
    const payload: EmailScheduleResult = {
      sql: this.sql.trim(),
      to: this.to.trim(),
      cc: this.cc.trim(),
      time: this.time,
      days: Array.from(this.days),
    };
    this.dialogRef.close(payload);
  }
}
