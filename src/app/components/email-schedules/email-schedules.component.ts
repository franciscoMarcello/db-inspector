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
import { DbInspectorService } from '../../services/db-inspector.service';

interface EmailSchedule extends EmailScheduleResult {
  id: string;
  active: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'dbi.email-schedules';

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
      this.api.sendEmail(res).subscribe({
        next: (resp) => {
          const schedule: EmailSchedule = {
            ...res,
            id: resp.scheduleId || this.makeId(),
            active: resp.status === 'scheduled',
            createdAt: new Date().toISOString(),
          };
          this.schedules = [schedule, ...this.schedules];
          this.persist();
          this.snack(resp.status === 'scheduled' ? 'Agendado com sucesso.' : 'Enviado agora.');
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
        message: 'Oi! Este é um e-mail de teste do DB Inspector.',
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
      this.api.sendEmail({ ...res }).subscribe({
        next: () => {
          this.schedules = this.schedules.map((s) =>
            s.id === schedule.id ? { ...s, ...res } : s
          );
          this.persist();
          this.snack('Agendamento atualizado.');
        },
        error: () => this.snack('Falha ao atualizar agendamento.'),
      });
    });
  }

  toggleActive(schedule: EmailSchedule) {
    this.schedules = this.schedules.map((s) =>
      s.id === schedule.id ? { ...s, active: !s.active } : s
    );
    this.persist();
    this.snack(schedule.active ? 'Agendamento pausado.' : 'Agendamento ativado.');
  }

  sendNow(schedule: EmailSchedule) {
    this.api
      .sendEmail({
        sql: schedule.sql,
        to: schedule.to,
        cc: schedule.cc,
        subject: 'Envio manual de agendamento',
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
    this.schedules = this.schedules.filter((s) => s.id !== schedule.id);
    this.persist();
    this.snack('Agendamento removido.');
  }

  formatDays(days: string[]): string {
    const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    return order
      .filter((d) => days.includes(d))
      .map((d) => this.dayLabels[d] || d)
      .join(', ');
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.schedules = parsed;
          return;
        }
      }
    } catch {}

    // Seed com exemplo inicial para primeira execução.
    this.schedules = [
      {
        id: this.makeId(),
        sql: "SELECT count(*) AS total FROM pedidos WHERE status = 'PENDING';",
        to: 'alertas@empresa.com',
        cc: '',
        time: '08:00',
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.schedules));
    } catch {}
  }

  private makeId(): string {
    const rnd = () => Math.random().toString(16).slice(2);
    return (crypto?.randomUUID?.() || `sch-${Date.now()}-${rnd()}`).toString();
  }

  private snack(msg: string) {
    this.snackBar.open(msg, 'OK', { duration: 1800 });
  }
}
