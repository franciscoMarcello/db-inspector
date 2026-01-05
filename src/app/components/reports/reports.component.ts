import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DbInspectorService } from '../../services/db-inspector.service';
import { EnvStorageService } from '../../services/env-storage.service';
import { ReportDefinition, ReportService } from '../../services/report.service';
import { QueryParam, QueryParamsDialog } from '../query-params-dialog/query-params-dialog';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule, MatDialogModule],
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
  variablesRaw: Record<string, string> = {};
  variableNames: string[] = [];

  constructor(
    private reportService: ReportService,
    private dbInspector: DbInspectorService,
    private envStorage: EnvStorageService,
    private dialog: MatDialog,
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

  async runReport(report: ReportDefinition) {
    const serverUrl = this.reportService.getServerUrl();
    const templateName = report.templateName || this.reportService.getDefaultTemplate();

    if (!serverUrl || !templateName) {
      this.snack('Configure o jsreport antes de executar.');
      return;
    }

    const sql = (report.sql || '').trim();
    if (!sql) {
      this.snack('SQL do relatorio vazia.');
      return;
    }

    const ok = await this.openParamsDialog(sql);
    if (!ok) return;

    const vars = this.buildVariablesMap();

    let finalSql: string;
    try {
      finalSql = this.expandVariables(sql, vars);
    } catch (e: any) {
      this.snack(e?.message || 'Erro ao montar SQL com parametros.');
      return;
    }

    const t0 = performance.now();
    this.dbInspector.runQuery(finalSql).subscribe({
      next: (res) => {
        const elapsedMs = Math.round(performance.now() - t0);
        const payload = this.buildReportPayload(report, res, elapsedMs, finalSql, vars);
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

  private buildReportPayload(
    report: ReportDefinition,
    res: any,
    elapsedMs: number,
    executedQuery: string,
    paramsMap: Record<string, any>
  ) {
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
    const totals = this.computeTotals(rows);

    return {
      meta: {
        reportName: report.name,
        environment: this.envStorage.getActive()?.name ?? 'Sem ambiente',
        generatedAt: this.formatDateTime(new Date()),
        lastRunAt: this.formatDateTime(new Date()),
        rowCount: rows.length,
        elapsedMs,
        truncated: false,
        period: this.buildPeriodLabel(paramsMap),
      },
      query: executedQuery || report.sql,
      params: this.buildParamsPayload(paramsMap),
      paramsMap,
      columns,
      rows,
      summaries,
      totals,
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
    const date = this.formatDate(value);
    const HH = pad(value.getHours());
    const mm = pad(value.getMinutes());
    const ss = pad(value.getSeconds());
    return `${date} ${HH}:${mm}:${ss}`;
  }

  private formatDateTimeSql(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = value.getFullYear();
    const MM = pad(value.getMonth() + 1);
    const dd = pad(value.getDate());
    const HH = pad(value.getHours());
    const mm = pad(value.getMinutes());
    const ss = pad(value.getSeconds());
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }

  private formatDate(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = value.getFullYear();
    const MM = pad(value.getMonth() + 1);
    const dd = pad(value.getDate());
    return `${dd}/${MM}/${yyyy}`;
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

  private buildParamsPayload(map: Record<string, any>) {
    const items = this.variableNames.map((name) => ({
      name,
      value: map[name],
      display: this.formatParamValue(map[name]),
    }));
    return items;
  }

  private formatParamValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return this.formatDate(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  private computeTotals(rows: any[]) {
    const normalize = (v: any) => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v === null || v === undefined || v === '') return 0;
      const cleaned = String(v).replace(/\./g, '').replace(',', '.');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    };

    const raw = (rows || []).reduce((acc, row) => acc + normalize(row?.['qt_consumido']), 0);
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(raw);

    return {
      qtConsumido: raw,
      qtConsumidoFormatted: formatted,
    };
  }

  private buildPeriodLabel(map: Record<string, any>): string | null {
    const start = map?.['data'] ?? map?.['dataInicio'];
    const end = map?.['data1'] ?? map?.['dataFim'];

    if (!start && !end) return null;

    const formatValue = (v: any) => {
      if (v instanceof Date) return this.formatDate(v);
      const s = String(v ?? '').trim();
      return s || '?';
    };

    if (start && end) return `Periodo: ${formatValue(start)} ate ${formatValue(end)}`;
    if (start) return `Periodo: ${formatValue(start)}`;
    return `Periodo ate ${formatValue(end)}`;
  }

  private expandVariables(sql: string, vars: Record<string, any>): string {
    return sql.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (full, name) => {
      if (!(name in vars)) return full;

      const value = vars[name];

      if (value === null || value === undefined) {
        return 'NULL';
      }

      if (value instanceof Date) {
        const s = this.formatDateTimeSql(value);
        const escaped = s.replace(/'/g, "''");
        return `'${escaped}'`;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new Error(`Valor numerico invalido para :${name}`);
        }
        return String(value);
      }

      if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
      }

      const s = String(value).replace(/'/g, "''");
      return `'${s}'`;
    });
  }

  private updateVariableNamesFromQuery(sql: string) {
    const names = new Set<string>();
    const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(sql)) !== null) {
      names.add(match[1]);
    }

    this.variableNames = Array.from(names).sort();
  }

  private buildVariablesMap(): Record<string, any> {
    const map: Record<string, any> = {};

    for (const name of this.variableNames) {
      const raw = (this.variablesRaw[name] ?? '').trim();

      if (!raw) {
        map[name] = null;
        continue;
      }

      if (/^-?\d+(\.\d+)?$/.test(raw)) {
        map[name] = Number(raw);
        continue;
      }

      if (/^(true|false)$/i.test(raw)) {
        map[name] = raw.toLowerCase() === 'true';
        continue;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        map[name] = new Date(raw + 'T00:00:00');
        continue;
      }

      map[name] = raw;
    }

    return map;
  }

  private openParamsDialog(sql: string): Promise<boolean> {
    this.updateVariableNamesFromQuery(sql);

    if (!this.variableNames.length) {
      return Promise.resolve(true);
    }

    const params: QueryParam[] = this.variableNames.map((name) => ({
      name,
      value: this.variablesRaw[name] ?? '',
    }));

    const dialogRef = this.dialog.open(QueryParamsDialog, {
      width: '520px',
      data: { params },
    });

    return new Promise<boolean>((resolve) => {
      dialogRef.afterClosed().subscribe((result: QueryParam[] | undefined) => {
        if (!result) {
          resolve(false);
          return;
        }

        for (const p of result) {
          this.variablesRaw[p.name] = p.value ?? '';
        }
        resolve(true);
      });
    });
  }
}
