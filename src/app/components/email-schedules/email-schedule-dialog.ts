import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DbInspectorService } from '../../services/db-inspector.service';
import { ReportService, ReportDefinition } from '../../services/report.service';

export interface EmailScheduleData {
  sql: string;
  forceSchedule?: boolean;
  secondSql?: string;
  compareWithSap?: boolean;
  comparisonKey?: string;
  comparisonTolerances?: Record<string, number>;
  sendOnlyIfDifferent?: boolean;
  comparisonTitle?: string;
  comparisonNote?: string;
  to?: string;
  cc?: string;
  subject?: string;
  message?: string;
  reportId?: string;
  attachPdf?: boolean;
  pdfMode?: 'report' | 'scheduled_sql';
  pdfTitle?: string;
  pdfSubtitle?: string;
  pdfIncludeSummary?: boolean;
  pdfMaxRows?: number;
  attachXlsx?: boolean;
  time?: string;
  days?: string[];
}

export interface EmailScheduleResult {
  sql: string;
  secondSql: string;
  compareWithSap: boolean;
  comparisonKey: string;
  comparisonTolerances: Record<string, number>;
  sendOnlyIfDifferent: boolean;
  comparisonTitle: string;
  comparisonNote: string;
  to: string;
  cc: string;
  subject: string;
  message: string;
  reportId: string;
  attachPdf: boolean;
  pdfMode: 'report' | 'scheduled_sql';
  pdfTitle: string;
  pdfSubtitle: string;
  pdfIncludeSummary: boolean;
  pdfMaxRows: number;
  attachXlsx: boolean;
  time: string;
  days: string[];
}

type ToleranceEntry = {
  field: string;
  value: string;
};

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
  secondSql = '';
  compareWithSap = false;
  comparisonKey = '';
  sendOnlyIfDifferent = true;
  comparisonTitle = '';
  comparisonNote = '';
  attachPdf = false;
  pdfMode: 'report' | 'scheduled_sql' = 'report';
  pdfTitle = '';
  pdfSubtitle = '';
  pdfIncludeSummary = true;
  pdfMaxRows = 3000;
  attachXlsx = true;
  reportId = '';
  message = '';
  scheduleEnabled = true;
  toInput = '';
  ccInput = '';
  toChips: string[] = [];
  ccChips: string[] = [];
  subject = '';
  time = '08:00';
  days: Set<string> = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
  sqlExpanded = false;
  messageExpanded = false;
  secondSqlExpanded = false;

  readonly daysOptions = DAYS;
  readonly messageVariables = [
    '{{status}}',
    '{{apenas_agromobi}}',
    '{{apenas_sap}}',
    '{{linhas_diferentes}}',
    '{{linhas_correspondentes}}',
    '{{data_execucao}}',
    '{{schedule_id}}',
  ];
  sendingTest = false;
  recipientError = '';
  ccError = '';
  readonly maxRecipients = 30;
  readonly browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  readonly isEditMode: boolean;
  readonly forceScheduleMode: boolean;
  readonly reports: ReportDefinition[] = [];
  tolerances: ToleranceEntry[] = [];
  compareError = '';
  pdfError = '';
  toleranceError = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) data: EmailScheduleData,
    private dialogRef: MatDialogRef<EmailScheduleDialogComponent, EmailScheduleResult>,
    private snackBar: MatSnackBar,
    private api: DbInspectorService,
    private reportService: ReportService
  ) {
    this.forceScheduleMode = Boolean(data?.forceSchedule);
    this.isEditMode = Boolean(data?.subject || data?.to || data?.cc || data?.days?.length);
    this.sql = (data?.sql || '').trim();
    this.secondSql = (data?.secondSql || '').trim();
    this.compareWithSap = Boolean(data?.compareWithSap);
    this.comparisonKey = data?.comparisonKey || '';
    this.sendOnlyIfDifferent = data?.sendOnlyIfDifferent !== false;
    this.comparisonTitle = data?.comparisonTitle || '';
    this.comparisonNote = data?.comparisonNote || '';
    this.attachPdf = Boolean(data?.attachPdf);
    this.pdfMode = data?.pdfMode === 'scheduled_sql' ? 'scheduled_sql' : 'report';
    this.pdfTitle = data?.pdfTitle || '';
    this.pdfSubtitle = data?.pdfSubtitle || '';
    this.pdfIncludeSummary = data?.pdfIncludeSummary !== false;
    this.pdfMaxRows = Number(data?.pdfMaxRows) > 0 ? Number(data?.pdfMaxRows) : 3000;
    this.attachXlsx = data?.attachXlsx !== false;
    this.reportId = data?.reportId || '';
    this.message = data?.message || '';
    this.toChips = this.parseEmails(data?.to || '');
    this.ccChips = this.parseEmails(data?.cc || '');
    this.subject = data?.subject || '';
    this.time = data?.time || '08:00';
    if (data?.days?.length) {
      this.days = new Set(data.days);
      this.scheduleEnabled = true;
    } else if (this.forceScheduleMode) {
      this.scheduleEnabled = true;
    } else {
      this.scheduleEnabled = false;
    }
    this.tolerances = this.normalizeToleranceEntries(data?.comparisonTolerances);
    this.loadReports();
  }

  toggleDay(dayId: string) {
    if (this.days.has(dayId)) {
      this.days.delete(dayId);
    } else {
      this.days.add(dayId);
    }
  }

  get canSave(): boolean {
    this.validateAdvancedFields();
    const hasSchedule = this.forceScheduleMode || this.scheduleEnabled;
    return Boolean(
      this.sql.trim() &&
        this.toChips.length &&
        this.subject.trim() &&
        (!hasSchedule || (this.time && this.days.size)) &&
        !this.recipientError &&
        !this.ccError &&
        !this.compareError &&
        !this.pdfError &&
        !this.toleranceError
    );
  }

  get canSendTest(): boolean {
    return this.toChips.length > 0 && !this.recipientError;
  }

  get modalTitle(): string {
    return this.isEditMode ? 'Editar agendamento por SQL' : 'Criar agendamento por SQL';
  }

  get selectedReportName(): string {
    if (!this.reportId) return 'Selecione um relatório';
    const selected = this.reports.find((report) => report.id === this.reportId);
    return selected?.name || this.reportId;
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
    this.validateAdvancedFields();
    if (!this.canSave) return;
    const payload: EmailScheduleResult = {
      sql: this.sql.trim(),
      secondSql: this.secondSql.trim(),
      compareWithSap: this.compareWithSap,
      comparisonKey: this.comparisonKey.trim(),
      comparisonTolerances: this.toToleranceRecord(),
      sendOnlyIfDifferent: this.sendOnlyIfDifferent,
      comparisonTitle: this.comparisonTitle.trim(),
      comparisonNote: this.comparisonNote.trim(),
      to: this.toChips.join(','),
      cc: this.ccChips.join(','),
      subject: this.subject.trim(),
      message: this.message.trim(),
      reportId: this.reportId,
      attachPdf: this.attachPdf,
      pdfMode: this.pdfMode,
      pdfTitle: this.pdfTitle.trim(),
      pdfSubtitle: this.pdfSubtitle.trim(),
      pdfIncludeSummary: this.pdfIncludeSummary,
      pdfMaxRows: Number(this.pdfMaxRows) || 0,
      attachXlsx: this.attachXlsx,
      time: this.forceScheduleMode || this.scheduleEnabled ? this.time : '',
      days: this.forceScheduleMode || this.scheduleEnabled ? Array.from(this.days) : [],
    };
    this.dialogRef.close(payload);
  }

  toggleCompareWithSap() {
    this.compareWithSap = !this.compareWithSap;
    this.validateAdvancedFields();
  }

  toggleAttachPdf() {
    this.attachPdf = !this.attachPdf;
    this.validateAdvancedFields();
  }

  setPdfMode(mode: 'report' | 'scheduled_sql') {
    this.pdfMode = mode;
    this.validateAdvancedFields();
  }

  addTolerance() {
    this.tolerances.push({ field: '', value: '' });
  }

  removeTolerance(index: number) {
    this.tolerances.splice(index, 1);
    this.validateAdvancedFields();
  }

  onToleranceChange() {
    this.validateAdvancedFields();
  }

  toggleSqlExpanded() {
    this.sqlExpanded = !this.sqlExpanded;
  }

  toggleMessageExpanded() {
    this.messageExpanded = !this.messageExpanded;
  }

  toggleSecondSqlExpanded() {
    this.secondSqlExpanded = !this.secondSqlExpanded;
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
    if (!this.scheduleEnabled || !this.time || !this.days.size) return null;
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

  private loadReports() {
    this.reportService.listReports().subscribe({
      next: (reports) => {
        this.reports.splice(0, this.reports.length, ...(reports || []));
      },
      error: () => {
        this.snackBar.open('Nao foi possivel carregar relatórios para anexo em PDF.', 'OK', {
          duration: 2200,
        });
      },
    });
  }

  private normalizeToleranceEntries(
    tolerances: Record<string, number> | undefined
  ): ToleranceEntry[] {
    if (!tolerances) return [];
    return Object.entries(tolerances).map(([field, value]) => ({
      field,
      value: Number.isFinite(value) ? String(value) : '',
    }));
  }

  private toToleranceRecord(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const tolerance of this.tolerances) {
      const field = tolerance.field.trim();
      if (!field) continue;
      const numeric = Number(tolerance.value);
      if (!Number.isFinite(numeric) || numeric < 0) continue;
      out[field] = numeric;
    }
    return out;
  }

  private validateAdvancedFields() {
    this.compareError = '';
    this.pdfError = '';
    this.toleranceError = '';

    if (this.compareWithSap && !this.secondSql.trim()) {
      this.compareError = 'Informe o SQL da fonte SAP para comparar.';
    }

    if (this.attachPdf && this.pdfMode === 'report' && !this.reportId.trim()) {
      this.pdfError = 'Selecione um relatório para anexar PDF.';
    }

    if (this.attachPdf) {
      const maxRows = Number(this.pdfMaxRows);
      if (!Number.isFinite(maxRows) || maxRows <= 0) {
        this.pdfError = 'Informe um limite de linhas para PDF maior que zero.';
      }
    }

    const hasInvalidTolerance = this.tolerances.some((tolerance) => {
      const hasField = tolerance.field.trim().length > 0;
      const hasValue = tolerance.value.trim().length > 0;
      if (!hasField && !hasValue) return false;
      if (!hasField || !hasValue) return true;
      const numeric = Number(tolerance.value);
      return !Number.isFinite(numeric) || numeric < 0;
    });

    if (hasInvalidTolerance) {
      this.toleranceError = 'Tolerâncias devem ter campo e valor numérico >= 0.';
    }
  }
}
