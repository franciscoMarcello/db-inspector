import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  ReportCreateInput,
  ReportDefinition,
  ReportFolder,
  ReportRunResponse,
  ReportService,
  ReportVariableInput,
} from '../../services/report.service';

type FolderNode = ReportFolder & {
  expanded: boolean;
};

type DraftVariable = ReportVariableInput & {
  enabled: boolean;
};

type ReportDraft = {
  id: string | null;
  name: string;
  sql: string;
  description: string;
  folderId: string;
};

const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;
const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class ReportsComponent implements OnInit {
  folders: FolderNode[] = [];
  reports: ReportDefinition[] = [];
  runResult: ReportRunResponse | null = null;

  selectedFolderId: string | null = null;
  selectedReportId: string | null = null;
  newFolderName = '';
  statusMessage = '';
  paramsError = '';
  loadingList = false;
  loadingRun = false;
  variableInputs: Record<string, string> = {};
  reportModalOpen = false;
  reportModalMode: 'create' | 'edit' = 'create';
  reportDraft: ReportDraft = {
    id: null,
    name: '',
    sql: '',
    description: '',
    folderId: '',
  };
  reportDraftVariables: DraftVariable[] = [];
  reportDraftError = '';
  private pendingCreateSql: string | null = null;

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.pendingCreateSql = this.consumePendingSql();
    this.loadData();
  }

  get selectedReport(): ReportDefinition | null {
    if (!this.selectedReportId) return null;
    return this.reports.find((report) => report.id === this.selectedReportId) ?? null;
  }

  get selectedFolder(): FolderNode | null {
    if (!this.selectedFolderId) return null;
    return this.folders.find((folder) => folder.id === this.selectedFolderId) ?? null;
  }

  get displayedRows(): Record<string, unknown>[] {
    const result = this.runResult;
    if (!result) return [];
    return result.rows;
  }

  get selectedReportVariables() {
    return [...(this.selectedReport?.variables ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  get statusToneClass(): string {
    const msg = (this.statusMessage || '').toLowerCase();
    if (msg.includes('falha') || msg.includes('inválido') || msg.includes('invalido')) {
      return 'status-error';
    }
    if (
      msg.includes('criado') ||
      msg.includes('atualizado') ||
      msg.includes('removido') ||
      msg.includes('concluida') ||
      msg.includes('executada')
    ) {
      return 'status-success';
    }
    return 'status-info';
  }

  get statusTitle(): string {
    if (this.statusToneClass === 'status-error') return 'Erro';
    if (this.statusToneClass === 'status-success') return 'Sucesso';
    return 'Info';
  }

  reportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.reports.filter((report) => this.belongsToFolder(report, folder));
  }

  toggleFolder(folderId: string) {
    this.folders = this.folders.map((folder) =>
      folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder
    );
  }

  selectFolder(folder: FolderNode) {
    this.selectedFolderId = folder.id;
    const first = this.reportsByFolder(folder)[0];
    this.selectedReportId = first?.id ?? null;
    this.runResult = null;
    this.statusMessage = '';
    if (this.selectedReportId) this.runSelectedReport();
  }

  selectReport(reportId: string) {
    this.selectedReportId = reportId;
    this.statusMessage = '';
    this.paramsError = '';
    this.initVariableInputs();
    this.runSelectedReport();
  }

  createFolder() {
    const name = this.newFolderName.trim();
    if (!name) {
      this.statusMessage = 'Informe um nome para a pasta.';
      return;
    }

    if (this.folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
      this.statusMessage = 'Ja existe uma pasta com esse nome.';
      return;
    }

    this.reportService.createFolder({ name, description: null }).subscribe({
      next: (folder) => {
        this.statusMessage = `Pasta "${folder.name}" criada.`;
        this.newFolderName = '';
        this.loadData(undefined, folder.id);
      },
      error: () => {
        this.statusMessage = 'Falha ao criar pasta.';
      },
    });
  }

  renameSelectedFolder() {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione uma pasta para renomear.';
      return;
    }

    const name = (prompt('Novo nome da pasta:', folder.name) || '').trim();
    if (!name || name === folder.name) return;

    this.reportService.updateFolder(folder.id, { name, description: folder.description }).subscribe({
      next: (updated) => {
        this.statusMessage = `Pasta renomeada para "${updated.name}".`;
        this.loadData(undefined, updated.id);
      },
      error: () => {
        this.statusMessage = 'Falha ao renomear pasta.';
      },
    });
  }

  deleteSelectedFolder() {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione uma pasta para excluir.';
      return;
    }
    if (!confirm(`Excluir pasta "${folder.name}"?`)) return;

    this.reportService.deleteFolder(folder.id).subscribe({
      next: () => {
        this.statusMessage = `Pasta "${folder.name}" removida.`;
        this.loadData();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.statusMessage = 'Nao foi possivel excluir: existe relatorio vinculado a esta pasta.';
          return;
        }
        this.statusMessage = 'Falha ao excluir pasta.';
      },
    });
  }

  applyFilters() {
    this.statusMessage = 'Consulta executada.';
    this.runSelectedReport();
  }

  openCreateReportModal(presetSql?: string) {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione ou crie uma pasta antes de criar um relatorio.';
      return;
    }

    this.reportModalMode = 'create';
    this.reportModalOpen = true;
    this.reportDraftError = '';
    this.reportDraft = {
      id: null,
      name: '',
      sql: (presetSql || 'SELECT 1 AS ok;').trim(),
      description: '',
      folderId: folder.id,
    };
    this.syncDraftVariablesFromSql();
  }

  openEditReportModal() {
    const current = this.selectedReport;
    const folder = this.selectedFolder;
    if (!current || !folder) return;

    this.reportModalMode = 'edit';
    this.reportModalOpen = true;
    this.reportDraftError = '';
    this.reportDraft = {
      id: current.id,
      name: current.name,
      sql: current.sql,
      description: current.description || '',
      folderId: folder.id,
    };
    this.syncDraftVariablesFromSql(current.variables || []);
  }

  closeReportModal() {
    this.reportModalOpen = false;
    this.reportDraftError = '';
  }

  onDraftSqlChanged() {
    this.syncDraftVariablesFromSql(this.reportDraftVariables);
  }

  saveReportFromModal() {
    const folder = this.folders.find((item) => item.id === this.reportDraft.folderId);
    if (!folder) {
      this.reportDraftError = 'Selecione uma pasta válida.';
      return;
    }

    const name = this.reportDraft.name.trim();
    const sql = this.reportDraft.sql.trim();
    const description = this.reportDraft.description.trim();

    if (!name) {
      this.reportDraftError = 'Informe o nome do relatório.';
      return;
    }
    if (!sql) {
      this.reportDraftError = 'Informe a SQL do relatório.';
      return;
    }

    const enabledVars = this.reportDraftVariables.filter((v) => v.enabled);
    const variables: ReportVariableInput[] = enabledVars.map((v, idx) => ({
      id: v.id,
      key: v.key,
      label: (v.label || v.key).trim(),
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue ? String(v.defaultValue) : null,
      orderIndex: idx,
    }));

    const payload: ReportCreateInput = {
      name,
      folderId: folder.id,
      templateName: folder.name,
      sql,
      description: description || null,
      variables,
    };

    if (this.reportModalMode === 'create') {
      console.log('[reports] create payload', payload);
      this.reportService.createReport(payload).subscribe({
        next: (created) => {
          this.statusMessage = `Relatorio "${created.name}" criado.`;
          this.reportModalOpen = false;
          this.loadData(created.id, folder.id);
        },
        error: () => {
          this.reportDraftError = 'Falha ao criar relatorio.';
        },
      });
      return;
    }

    if (!this.reportDraft.id) {
      this.reportDraftError = 'Relatório inválido para atualização.';
      return;
    }

    console.log('[reports] update payload', { id: this.reportDraft.id, payload });
    this.reportService.updateReport(this.reportDraft.id, payload).subscribe({
      next: (updated) => {
        this.statusMessage = `Relatorio "${updated.name}" atualizado.`;
        this.reportModalOpen = false;
        const nextFolder = updated.folderId ?? this.selectedFolderId;
        this.loadData(updated.id, nextFolder ?? undefined);
      },
      error: () => {
        this.reportDraftError = 'Falha ao atualizar relatorio.';
      },
    });
  }

  deleteSelectedReport() {
    const current = this.selectedReport;
    if (!current) return;
    if (!confirm(`Excluir relatorio "${current.name}"?`)) return;

    this.reportService.deleteReport(current.id).subscribe({
      next: () => {
        this.statusMessage = `Relatorio "${current.name}" removido.`;
        this.loadData(undefined, this.selectedFolderId ?? undefined);
      },
      error: () => {
        this.statusMessage = 'Falha ao remover relatorio.';
      },
    });
  }

  exportExcel() {
    const result = this.runResult;
    if (!result) return;
    const csv = this.toCsv(result.columns, result.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    this.downloadBlob(blob, `${this.fileName(result.name)}.csv`);
    this.statusMessage = `Exportacao Excel concluida para "${result.name}".`;
  }

  exportPdf() {
    const result = this.runResult;
    if (!result) return;
    this.statusMessage = `Exportacao PDF de "${result.name}" ainda sera integrada.`;
  }

  private loadData(preferredReportId?: string, preferredFolderId?: string) {
    this.loadingList = true;
    forkJoin({
      folders: this.reportService.listFolders(),
      reports: this.reportService.listReports(),
    }).subscribe({
      next: ({ folders, reports }) => {
        this.reports = reports || [];
        this.rebuildFolders(folders || []);
        this.reconcileSelection(preferredReportId, preferredFolderId);
        if (this.pendingCreateSql) {
          const sql = this.pendingCreateSql;
          this.pendingCreateSql = null;
          this.openCreateReportModal(sql);
        }
        this.loadingList = false;
      },
      error: () => {
        this.reports = [];
        this.folders = [];
        this.runResult = null;
        this.selectedFolderId = null;
        this.selectedReportId = null;
        this.loadingList = false;
        this.statusMessage = 'Falha ao carregar relatorios/pastas.';
      },
    });
  }

  private runSelectedReport() {
    if (!this.selectedReportId) {
      this.runResult = null;
      return;
    }

    const params = this.buildRunParams();
    if (params === null) {
      this.runResult = null;
      return;
    }

    this.loadingRun = true;
    this.reportService.runReportWithParams(this.selectedReportId, params).subscribe({
      next: (res) => {
        this.paramsError = '';
        this.runResult = res;
        this.loadingRun = false;
      },
      error: () => {
        this.runResult = null;
        this.loadingRun = false;
        this.statusMessage = 'Falha ao executar relatorio.';
      },
    });
  }

  private rebuildFolders(apiFolders: ReportFolder[]) {
    const expanded = new Map(this.folders.map((folder) => [folder.id, folder.expanded]));
    this.folders = (apiFolders || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((folder) => ({
        ...folder,
        expanded: expanded.get(folder.id) ?? true,
      }));

    if (this.selectedFolderId && !this.folders.some((folder) => folder.id === this.selectedFolderId)) {
      this.selectedFolderId = null;
    }
  }

  private reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    if (!this.reports.length || !this.folders.length) {
      this.selectedFolderId = this.folders[0]?.id ?? null;
      this.selectedReportId = null;
      this.runResult = null;
      return;
    }

    if (preferredFolderId) {
      this.selectedFolderId = preferredFolderId;
    } else if (!this.selectedFolderId) {
      this.selectedFolderId = this.folders[0]?.id ?? null;
    }

    const selectedFolder = this.selectedFolder;
    let report = preferredReportId
      ? this.reports.find((item) => item.id === preferredReportId)
      : this.selectedReportId
      ? this.reports.find((item) => item.id === this.selectedReportId)
      : undefined;

    if (!report && selectedFolder) {
      report = this.reports.find((item) => this.belongsToFolder(item, selectedFolder));
    }
    if (!report) report = this.reports[0];

    this.selectedReportId = report?.id ?? null;

    if (this.selectedReportId) {
      if (report?.folderId) {
        this.selectedFolderId = report.folderId;
      } else if (report?.folderName) {
        const folderByName = this.folders.find((folder) => folder.name === report.folderName);
        if (folderByName) this.selectedFolderId = folderByName.id;
      } else if (report?.templateName) {
        // Backward compatibility if API still returns templateName.
        const folderByTemplate = this.folders.find(
          (folder) => folder.name === report.templateName || folder.id === report.templateName
        );
        if (folderByTemplate) this.selectedFolderId = folderByTemplate.id;
      }
      this.initVariableInputs();
      this.runSelectedReport();
    } else {
      this.runResult = null;
    }
  }

  private variablesFromSql(sql: string, currentVars: ReportVariableInput[] = []): ReportVariableInput[] {
    const currentByKey = new Map(currentVars.map((v) => [v.key, v]));
    const seen = new Set<string>();
    const vars: ReportVariableInput[] = [];
    let match: RegExpExecArray | null;

    while ((match = SQL_VARIABLE_RE.exec(sql)) !== null) {
      const key = match[2];
      if (seen.has(key)) continue;
      seen.add(key);
      const current = currentByKey.get(key);
      vars.push({
        key,
        label: current?.label ?? key,
        type: current?.type ?? 'string',
        required: current?.required ?? false,
        defaultValue: current?.defaultValue ?? null,
        orderIndex: vars.length,
      });
    }

    return vars;
  }

  private toCsv(columns: string[], rows: Record<string, unknown>[]): string {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = columns.map((col) => escape(col)).join(',');
    const lines = rows.map((row) => columns.map((col) => escape(row[col])).join(','));
    return [header, ...lines].join('\n');
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private fileName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private belongsToFolder(report: ReportDefinition, folder: FolderNode): boolean {
    if (report.folderId && String(report.folderId) === String(folder.id)) return true;
    if (report.folderName && String(report.folderName) === String(folder.name)) return true;
    if (report.templateName && String(report.templateName) === String(folder.name)) return true;
    if (report.templateName && String(report.templateName) === String(folder.id)) return true;
    return false;
  }

  private initVariableInputs() {
    const vars = this.selectedReportVariables;
    const next: Record<string, string> = {};
    for (const v of vars) {
      const existing = this.variableInputs[v.key];
      if (existing !== undefined) {
        next[v.key] = existing;
        continue;
      }
      next[v.key] = v.defaultValue ?? '';
    }
    this.variableInputs = next;
  }

  private buildRunParams(): Record<string, unknown> | null {
    const vars = this.selectedReportVariables;
    if (!vars.length) return {};

    const params: Record<string, unknown> = {};
    for (const v of vars) {
      const rawInput = (this.variableInputs[v.key] ?? '').trim();
      const raw = rawInput || (v.defaultValue ?? '');

      if (!raw) {
        if (v.required) {
          this.paramsError = `Parametro obrigatório sem valor: ${v.label || v.key}`;
          this.statusMessage = this.paramsError;
          return null;
        }
        continue;
      }

      const converted = this.convertVariableValue(v.type, raw, v.key);
      if (converted === undefined) return null;
      params[v.key] = converted;
    }

    this.paramsError = '';
    return params;
  }

  private convertVariableValue(
    type: ReportVariableInput['type'],
    raw: string,
    key: string
  ): unknown | undefined {
    if (type === 'string') return raw;

    if (type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        this.paramsError = `Valor inválido para ${key}: esperado número.`;
        this.statusMessage = this.paramsError;
        return undefined;
      }
      return n;
    }

    if (type === 'boolean') {
      const normalized = raw.toLowerCase();
      if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false;
      this.paramsError = `Valor inválido para ${key}: esperado booleano.`;
      this.statusMessage = this.paramsError;
      return undefined;
    }

    if (type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        this.paramsError = `Valor inválido para ${key}: esperado yyyy-MM-dd.`;
        this.statusMessage = this.paramsError;
        return undefined;
      }
      return raw;
    }

    if (type === 'datetime') {
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
      const fromLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
        ? new Date(`${raw}:00`)
        : new Date(raw);
      if (Number.isNaN(fromLocal.getTime())) {
        this.paramsError = `Valor inválido para ${key}: esperado datetime ISO.`;
        this.statusMessage = this.paramsError;
        return undefined;
      }
      return this.formatDateTime(fromLocal);
    }

    return raw;
  }

  private formatDateTime(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
      value.getHours()
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  private syncDraftVariablesFromSql(existing: Array<Partial<DraftVariable>> = []) {
    const existingByKey = new Map(existing.map((v) => [String(v.key || ''), v]));
    const detected = this.variablesFromSql(this.reportDraft.sql, []);
    this.reportDraftVariables = detected.map((v, idx) => {
      const current = existingByKey.get(v.key);
      return {
        id: current?.id ? String(current.id) : undefined,
        key: v.key,
        label: String(current?.label ?? v.key),
        type: (current?.type as DraftVariable['type']) || 'string',
        required: Boolean(current?.required ?? false),
        defaultValue:
          current?.defaultValue === undefined || current?.defaultValue === null
            ? null
            : String(current.defaultValue),
        orderIndex: idx,
        enabled: Boolean(current?.enabled ?? true),
      };
    });
  }

  private consumePendingSql(): string | null {
    try {
      const sql = (localStorage.getItem(REPORT_DRAFT_SQL_KEY) || '').trim();
      localStorage.removeItem(REPORT_DRAFT_SQL_KEY);
      return sql || null;
    } catch {
      return null;
    }
  }
}
