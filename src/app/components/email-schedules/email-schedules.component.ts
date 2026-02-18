import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  EmailScheduleDialogComponent,
  EmailScheduleResult,
} from './email-schedule-dialog';
import { DbInspectorService, ApiEmailSchedule } from '../../services/db-inspector.service';

type EmailSchedule = {
  id: string;
  sql: string;
  to: string;
  cc: string;
  subject: string;
  time: string;
  days: string[];
  active: boolean;
  createdAt?: string;
  status?: string;
  cron?: string;
  nextRun?: string;
};

@Component({
  selector: 'app-email-schedules',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './email-schedules.component.html',
  styleUrls: ['./email-schedules.component.css'],
})
export class EmailSchedulesComponent implements OnInit {
  schedules: EmailSchedule[] = [];
  filter = '';
  loading = false;

  dayLabels: Record<string, string> = {
    mon: 'Seg',
    tue: 'Ter',
    wed: 'Qua',
    thu: 'Qui',
    fri: 'Sex',
    sat: 'Sáb',
    sun: 'Dom',
  };

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private api: DbInspectorService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get filtered(): EmailSchedule[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.schedules;
    return this.schedules.filter((s) => {
      return (
        s.to.toLowerCase().includes(q) ||
        s.cc.toLowerCase().includes(q) ||
        (s.subject || '').toLowerCase().includes(q) ||
        s.sql.toLowerCase().includes(q) ||
        s.time.toLowerCase().includes(q) ||
        this.formatDays(s.days).toLowerCase().includes(q)
      );
    });
  }

  trackId = (_: number, s: EmailSchedule) => s.id;

  startNew() {
    const dialogRef = this.dialog.open(EmailScheduleDialogComponent, {
      width: '1024px',
      maxWidth: '98vw',
      data: { sql: '' },
    });

    dialogRef.afterClosed().subscribe((res?: EmailScheduleResult) => {
      if (!res) return;
      this.api
        .createEmailSchedule({
          sql: res.sql,
          to: res.to,
          cc: res.cc,
          subject: res.subject,
          time: res.time,
          days: this.toApiDays(res.days),
          asDict: true,
          withDescription: true,
        })
        .subscribe({
          next: (schedule) => {
            this.schedules = [this.toUiSchedule(schedule), ...this.schedules];
            this.snack('Agendado com sucesso.');
          },
          error: () => this.snack('Falha ao agendar.'),
        });
    });
  }

  sendSimpleTest() {
    const to = prompt('Para (e-mails separados por vírgula):');
    if (!to || !to.trim()) {
      this.snack('Informe pelo menos um e-mail.');
      return;
    }
    const cc = prompt('CC (opcional):') || '';

    this.api
      .sendEmailTest({
        to: to.trim(),
        cc: cc.trim(),
        subject: 'Teste de e-mail',
        message: 'Oi! Este é um e-mail de teste do AgroReport.',
      })
      .subscribe({
        next: () => this.snack('Teste enviado.'),
        error: () => this.snack('Falha ao enviar teste.'),
      });
  }

  edit(schedule: EmailSchedule) {
    const dialogRef = this.dialog.open(EmailScheduleDialogComponent, {
      width: '1024px',
      maxWidth: '98vw',
      data: { ...schedule },
    });

    dialogRef.afterClosed().subscribe((res?: EmailScheduleResult) => {
      if (!res) return;
      this.api
        .updateEmailSchedule(schedule.id, {
          sql: res.sql,
          to: res.to,
          cc: res.cc,
          subject: res.subject,
          time: res.time,
          days: this.toApiDays(res.days),
        })
        .subscribe({
          next: (updated) => {
            const mapped = this.toUiSchedule(updated);
            this.schedules = this.schedules.map((s) => (s.id === updated.id ? mapped : s));
            this.snack('Agendamento atualizado.');
          },
          error: () => this.snack('Falha ao atualizar agendamento.'),
        });
    });
  }

  toggleActive(schedule: EmailSchedule) {
    const request = schedule.active
      ? this.api.pauseEmailSchedule(schedule.id)
      : this.api.resumeEmailSchedule(schedule.id);

    request.subscribe({
      next: (updated) => {
        if (!updated) {
          this.load();
          this.snack('Status atualizado.');
          return;
        }
        const mapped = this.toUiSchedule(updated);
        this.schedules = this.schedules.map((s) => (s.id === updated.id ? mapped : s));
        this.snack(mapped.active ? 'Agendamento ativado.' : 'Agendamento pausado.');
      },
      error: () => this.snack('Falha ao atualizar status.'),
    });
  }

  sendNow(schedule: EmailSchedule) {
    this.api
      .sendEmail({
        sql: schedule.sql,
        to: schedule.to,
        cc: schedule.cc,
        subject: schedule.subject || 'Envio manual de agendamento',
        asDict: true,
        withDescription: true,
      })
      .subscribe({
        next: () => this.snack(`Envio disparado para ${schedule.to}.`),
        error: () => this.snack('Falha ao enviar agora.'),
      });
  }

  remove(schedule: EmailSchedule) {
    if (!confirm('Remover este agendamento?')) return;
    this.api.deleteEmailSchedule(schedule.id).subscribe({
      next: () => {
        this.schedules = this.schedules.filter((s) => s.id !== schedule.id);
        this.snack('Agendamento removido.');
      },
      error: () => this.snack('Falha ao remover agendamento.'),
    });
  }

  formatDays(days: string[]): string {
    const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    return order
      .filter((d) => days.includes(d))
      .map((d) => this.dayLabels[d] || d)
      .join(', ');
  }

  private load() {
    this.loading = true;
    this.api.listEmailSchedules().subscribe({
      next: (schedules) => {
        this.schedules = (schedules || []).map((s) => this.toUiSchedule(s));
        this.loading = false;
      },
      error: () => {
        this.schedules = [];
        this.loading = false;
        this.snack('Falha ao carregar agendamentos.');
      },
    });
  }

  private toUiSchedule(api: ApiEmailSchedule | null | undefined): EmailSchedule {
    if (!api) {
      throw new Error('Agendamento invalido');
    }
    return {
      id: api.id,
      sql: api.sql,
      to: api.to,
      cc: api.cc || '',
      subject: api.subject || '',
      time: api.time,
      days: this.fromApiDays(api.days || []),
      active: this.isActive(api.status),
      createdAt: api.nextRun || undefined,
      status: api.status,
      cron: api.cron,
      nextRun: api.nextRun,
    };
  }

  private isActive(status?: string): boolean {
    const value = (status || '').toUpperCase();
    if (!value) return true;
    return value !== 'PAUSED' && value !== 'DISABLED';
  }

  private toApiDays(days: string[]): string[] {
    const map: Record<string, string> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    return days
      .map((d) => d.toLowerCase())
      .map((d) => map[d] || d)
      .filter(Boolean);
  }

  private fromApiDays(days: string[]): string[] {
    const map: Record<string, string> = {
      MONDAY: 'mon',
      TUESDAY: 'tue',
      WEDNESDAY: 'wed',
      THURSDAY: 'thu',
      FRIDAY: 'fri',
      SATURDAY: 'sat',
      SUNDAY: 'sun',
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    return (days || []).map((d) => map[d] || d.toLowerCase());
  }

  private snack(msg: string) {
    this.snackBar.open(msg, 'OK', { duration: 1800 });
  }
}
