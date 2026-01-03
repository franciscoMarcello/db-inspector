import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DbInspectorService } from '../../services/db-inspector.service';
import { EnvStorageService } from '../../services/env-storage.service';
import { ReportDefinition, ReportService } from '../../services/report.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class ReportsComponent implements OnInit {
  @ViewChild('reportDialog') reportDialog!: ElementRef<HTMLDialogElement>;

  serverUrl = '';
  defaultTemplate = '';
  reports: ReportDefinition[] = [];

  editing: ReportDefinition | null = null;
  draft: {
    name: string;
    templateName: string;
    sql: string;
    description: string;
  } = {
    name: '',
    templateName: '',
    sql: '',
    description: '',
  };

  constructor(
    private reportService: ReportService,
    private dbInspector: DbInspectorService,
    private envStorage: EnvStorageService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.serverUrl = this.reportService.getServerUrl() || 'http://localhost:5488';
    this.defaultTemplate = this.reportService.getDefaultTemplate() || 'db-report';
    this.loadReports();
  }

  saveDefaults() {
    const serverUrl = this.serverUrl.trim();
    const template = this.defaultTemplate.trim();

    if (!serverUrl || !template) {
      this.snack('Preencha a URL e o template padrao.');
      return;
    }

    this.reportService.setServerUrl(serverUrl);
    this.reportService.setDefaultTemplate(template);
    this.snack('Configuracao salva.');
  }

  openCreate() {
    this.editing = null;
    this.draft = {
      name: '',
      templateName: this.defaultTemplate.trim(),
      sql: '',
      description: '',
    };
    this.reportDialog.nativeElement.showModal();
  }

  openEdit(report: ReportDefinition) {
    this.editing = report;
    this.draft = {
      name: report.name,
      templateName: report.templateName,
      sql: report.sql,
      description: report.description || '',
    };
    this.reportDialog.nativeElement.showModal();
  }

  closeDialog() {
    this.reportDialog.nativeElement.close();
  }

  saveReport() {
    const name = this.draft.name.trim();
    const templateName = this.draft.templateName.trim();
    const sql = this.draft.sql.trim();

    if (!name || !templateName || !sql) {
      this.snack('Nome, template e SQL sao obrigatorios.');
      return;
    }

    const payload = {
      name,
      templateName,
      sql,
      description: this.draft.description.trim(),
    };

    const request = this.editing
      ? this.reportService.updateReport(this.editing.id, payload)
      : this.reportService.createReport(payload);

    request.subscribe({
      next: () => {
        this.loadReports();
        this.reportDialog.nativeElement.close();
        this.snack('Relatorio salvo.');
      },
      error: () => this.snack('Falha ao salvar relatorio.'),
    });
  }

  removeReport(report: ReportDefinition) {
    if (!confirm(`Remover "${report.name}"?`)) return;
    this.reportService.removeReport(report.id).subscribe({
      next: () => {
        this.loadReports();
        this.snack('Relatorio removido.');
      },
      error: () => this.snack('Falha ao remover relatorio.'),
    });
  }

  runReport(report: ReportDefinition) {
    const serverUrl = this.reportService.getServerUrl();
    const templateName = report.templateName || this.reportService.getDefaultTemplate();

    if (!serverUrl || !templateName) {
      this.snack('Configure o jsreport antes de executar.');
      return;
    }

    const t0 = performance.now();
    this.dbInspector.runQuery(report.sql).subscribe({
      next: (res) => {
        const elapsedMs = Math.round(performance.now() - t0);
        const payload = this.buildReportPayload(report, res, elapsedMs);
        this.reportService.renderReport(serverUrl, templateName, payload).subscribe({
          next: (blob) => this.downloadBlob(blob, this.makeFileName(report.name, 'pdf')),
          error: () => this.snack('Falha ao gerar PDF via jsreport.'),
        });
      },
      error: () => this.snack('Falha ao executar a consulta do relatorio.'),
    });
  }

  private loadReports() {
    this.reportService.listReports().subscribe({
      next: (reports) => {
        this.reports = reports || [];
      },
      error: () => {
        this.reports = [];
        this.snack('Falha ao carregar relatorios.');
      },
    });
  }

  private buildReportPayload(report: ReportDefinition, res: any, elapsedMs: number) {
    const data = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res)
      ? res
      : Array.isArray(res?.rows)
      ? res.rows
      : [];
    const columns =
      data.length && typeof data[0] === 'object' && !Array.isArray(data[0])
        ? Object.keys(data[0])
        : ['value'];
    const rows =
      columns.length === 1 && columns[0] === 'value'
        ? data.map((v: any) => ({ value: v }))
        : data;
    const summaries = this.buildSummaries(columns, rows);

    return {
      meta: {
        environment: this.envStorage.getActive()?.name ?? 'Sem ambiente',
        generatedAt: this.formatDateTime(new Date()),
        lastRunAt: this.formatDateTime(new Date()),
        rowCount: rows.length,
        elapsedMs,
        truncated: false,
      },
      query: report.sql,
      columns,
      rows,
      summaries,
    };
  }

  private buildSummaries(columns: string[], rows: any[]) {
    return columns
      .map((column) => {
        let sum = 0;
        let hasNumber = false;

        for (const row of rows) {
          const value = row?.[column];
          if (value === null || value === undefined || value === '') continue;

          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return { column, sum: null };
          }

          sum += value;
          hasNumber = true;
        }

        return { column, sum: hasNumber ? sum : null };
      })
      .filter((s) => s.sum !== null);
  }

  private formatDateTime(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = value.getFullYear();
    const MM = pad(value.getMonth() + 1);
    const dd = pad(value.getDate());
    const HH = pad(value.getHours());
    const mm = pad(value.getMinutes());
    const ss = pad(value.getSeconds());
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }

  private makeFileName(prefix: string, ext: string) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
      d.getHours()
    )}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private snack(message: string) {
    this.snackBar.open(message, 'OK', { duration: 1800 });
  }
}
