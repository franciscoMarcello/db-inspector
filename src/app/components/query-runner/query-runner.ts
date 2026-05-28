import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { DbInspectorService } from '../../services/db-inspector.service';
import { ReportConnectionSource, ReportService } from '../../services/report.service';
import { finalize } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { SnippetStorageService, QuerySnippet } from '../../services/snippet-storage.service';
import { QueryParam, QueryParamsDialog } from '../query-params-dialog/query-params-dialog';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import {
  EmailScheduleDialogComponent,
  EmailScheduleResult,
} from '../email-schedules/email-schedule-dialog';
import { MatIconModule } from '@angular/material/icon';
import { createXlsxBlob } from '../../utils/xlsx-export';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
import { ResultTableComponent } from '../shared/result-table/result-table.component';
import {
  buildVariablesMap,
  expandSqlVariables,
  stripSqlComments,
} from './query-runner.sql-utils';
import { QueryEditor, QueryRunnerEditorHost, QueryRunnerEditorLogic } from './query-runner.editor.logic';
import { QueryRunnerSnippetsHost, QueryRunnerSnippetsLogic } from './query-runner.snippets.logic';

const STORAGE_KEY = 'dbi.query.state';
const SNIPPETS_COLLAPSED_KEY = 'dbi.query.snippets_collapsed';
const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';

@Component({
  selector: 'app-query-runner',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressBarModule,
    MatCardModule,
    MatSnackBarModule,
    MonacoEditorModule,
    MatDialogModule,
    MatIconModule,
    AppButtonComponent,
    ResultTableComponent,
  ],
  templateUrl: './query-runner.html',
  styleUrls: ['./query-runner.css'],
})
export class QueryRunnerComponent
  implements OnInit, OnDestroy, QueryRunnerEditorHost, QueryRunnerSnippetsHost {
  readonly defaultPageSize = 200;
  readonly maxPageSize = 1000;
  readonly defaultRunAllDisplayLimit = 5000;
  readonly maxRunAllDisplayLimit = 200000;
  editorOptions = {
    language: 'sql',
    theme: 'dbi-sql-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    fontSize: 14,
    readOnly: false,
  };
  variablesRaw: Record<string, string> = {};
  variableNames: string[] = [];

  lastRunAt: Date | null = null;
  loading = false;
  error: string | null = null;
  displayedColumns: string[] = [];
  rows: Record<string, unknown>[] = [];
  rowCount = 0;
  elapsedMs = 0;
  page = 0;
  size = this.defaultPageSize;
  usingAllMode = false;
  cursorLine = 1;
  cursorColumn = 1;
  executeMenuOpen = false;
  saveMenuOpen = false;
  exportMenuOpen = false;
  snippetMenuOpenId: string | null = null;
  runAllDisplayLimit = this.defaultRunAllDisplayLimit;
  allModeTruncated = false;
  connectionTestLoadingSource: ReportConnectionSource | null = null;
  connectionTestStatus = '';
  connectionTestTone: 'ok' | 'error' | 'neutral' = 'neutral';
  lastSavedQuery = '';
  private lastExecutedSql: string | null = null;
  private readonly editorLogic: QueryRunnerEditorLogic;
  private readonly snippetsLogic: QueryRunnerSnippetsLogic;

  constructor(
    private api: DbInspectorService,
    private snackBar: MatSnackBar,
    private snippetsStore: SnippetStorageService,
    private dialog: MatDialog,
    private router: Router,
    private reportService: ReportService
  ) {
    this.editorLogic = new QueryRunnerEditorLogic(this);
    this.snippetsLogic = new QueryRunnerSnippetsLogic(this, snippetsStore);
  }

  snippets: QuerySnippet[] = [];
  snippetsCollapsed = false;
  snippetFilter = '';
  selectedSnippetId: string | null = null;
  folders: string[] = [];
  selectedFolder: string | null = null;
  isDraggingSnippetOverEditor = false;
  editor?: QueryEditor;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  trackSnippetId = (_: number, s: QuerySnippet) => s.id;
  trackFolder = (_: number, folder: string) => folder;
  query = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.query ?? 'SELECT 1 AS ok;';

  ngOnInit() {
    this.restoreSnippetsCollapsedState();
    this.lastSavedQuery = this.query;
    // Load stored snippets immediately so the snippets panel renders without waiting for Monaco.
    this.refreshSnippets();
  }

  onEditorInit(editor: QueryEditor) {
    const monaco = (window as unknown as { monaco?: unknown }).monaco as {
      editor?: {
        defineTheme?: (theme: string, data: unknown) => void;
        setTheme?: (theme: string) => void;
      };
      KeyMod: { CtrlCmd: number };
      KeyCode: { Enter: number };
    };
    this.editor = editor;
    this.editorLogic.onEditorInit(editor, monaco, () => this.loadState(), () => this.runPaged());
  }

  private refreshSnippets() { this.snippetsLogic.refreshSnippets(); }

  private recomputeFolders() { this.snippetsLogic.recomputeFolders(); }

  ngOnDestroy() {
    this.persistState();
  }

  saveCurrentAsSnippet() {
    this.snippetsLogic.saveCurrentAsSnippet();
  }

  loadSnippet(id: string) {
    this.snippetsLogic.loadSnippet(id);
    this.updateVariableNamesFromQuery();
  }

  renameSnippet(id: string) { this.snippetsLogic.renameSnippet(id); }

  deleteSnippet(id: string) { this.snippetsLogic.deleteSnippet(id); }

  schedulePersist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistState(), 300);
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === 'enter') {
      event.preventDefault();
      this.runPaged();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault();
      this.saveOnSelectedSnippet();
    }
  }

  persistState() {
    try {
      const viewState = this.editor?.saveViewState?.();
      const payload = { query: this.query ?? '', viewState };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  private loadState(): { query: string; viewState?: unknown } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async runPaged() {
    this.closeAllMenus();
    await this.runWithMode(false);
  }

  async runAll() {
    const limit = this.sanitizedRunAllDisplayLimit;
    const proceed = confirm(
      `⚠ Pode retornar muitos registros e impactar o banco.\n\n` +
        `Deseja continuar em /query/all?\n` +
        `A interface exibirá no máximo ${limit} linhas.`
    );
    if (!proceed) return;
    this.closeAllMenus();
    await this.runWithMode(true);
  }

  private async runWithMode(all: boolean) {
    const q = (this.query || '').trim();
    if (!q) {
      this.error = 'Informe a SQL.';
      return;
    }

    const runnableSql = stripSqlComments(q).trim();
    if (!runnableSql) {
      this.error = 'A SQL contém apenas comentários.';
      return;
    }

    const ok = await this.openParamsDialog();
    if (!ok) {
      return;
    }

    const vars = this.buildVariablesMap();

    let finalSql: string;
    try {
      finalSql = expandSqlVariables(runnableSql, vars);
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Erro ao expandir variáveis.';
      return;
    }

    this.page = 0;
    this.lastExecutedSql = finalSql;
    this.usingAllMode = all;
    this.executeQuery(finalSql, all);
  }

  nextPage() {
    if (!this.canGoNext || !this.lastExecutedSql) return;
    this.page += 1;
    this.executeQuery(this.lastExecutedSql, false);
  }

  prevPage() {
    if (!this.canGoPrev || !this.lastExecutedSql) return;
    this.page -= 1;
    this.executeQuery(this.lastExecutedSql, false);
  }

  onPageSizeChange() {
    const n = Number(this.size);
    if (!Number.isFinite(n) || n < 1) this.size = this.defaultPageSize;
    else this.size = Math.min(this.maxPageSize, Math.trunc(n));

    if (!this.usingAllMode && this.lastExecutedSql) {
      this.page = 0;
      this.executeQuery(this.lastExecutedSql, false);
    }
  }

  get canGoPrev(): boolean {
    return !this.loading && !this.usingAllMode && !!this.lastExecutedSql && this.page > 0;
  }

  get canGoNext(): boolean {
    return (
      !this.loading &&
      !this.usingAllMode &&
      !!this.lastExecutedSql &&
      this.rows.length >= this.size
    );
  }

  private executeQuery(sql: string, all: boolean) {
    this.loading = true;
    this.error = null;
    this.allModeTruncated = false;
    this.rows = [];
    this.displayedColumns = [];
    this.rowCount = 0;
    this.elapsedMs = 0;

    const t0 = performance.now();
    const request$ = all ? this.api.runQueryAll(sql) : this.api.runQuery(sql, this.page, this.size);
    request$
      .pipe(
        finalize(() => {
          this.loading = false;
          this.lastRunAt = new Date();
        })
      )
      .subscribe({
        next: (res) => {
          this.elapsedMs = Math.round(performance.now() - t0);
          const data = Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res)
            ? res
            : Array.isArray(res?.rows)
            ? res.rows
            : [];
          this.rowCount = data.length;
          const maxRows = this.sanitizedRunAllDisplayLimit;
          const displayData = all && data.length > maxRows ? data.slice(0, maxRows) : data;
          this.allModeTruncated = all && data.length > maxRows;
          if (displayData.length && typeof displayData[0] === 'object' && !Array.isArray(displayData[0])) {
            this.displayedColumns = Object.keys(displayData[0]);
            this.rows = displayData;
          } else {
            this.displayedColumns = ['value'];
            this.rows = displayData.map((v: unknown) => ({ value: v }));
          }
          if (this.allModeTruncated) {
            this.snack(
              `Mostrando ${this.rows.length} de ${this.rowCount} linhas para manter a interface responsiva.`
            );
          }
        },
        error: (err: unknown) => {
          this.elapsedMs = Math.round(performance.now() - t0);
          this.error =
            (err as { error?: { message?: string } })?.error?.message ||
            'Falha ao executar a consulta.';
        },
      });
  }

  testConnection(source: ReportConnectionSource) {
    if (this.connectionTestLoadingSource) return;

    const startedAt = performance.now();
    this.connectionTestLoadingSource = source;
    this.connectionTestStatus =
      source === 'sap'
        ? 'Testando SAP HANA com SELECT 1 AS "ok" FROM DUMMY...'
        : 'Testando Agromobi com SELECT 1 AS ok...';
    this.connectionTestTone = 'neutral';

    const request$: Observable<{ valid?: boolean; errors?: string[]; ok?: boolean; message?: string; elapsedMs?: number }> =
      source === 'sap'
        ? this.reportService.testSapConnection()
        : this.reportService.testAgromobiConnection();

    request$.subscribe({
      next: (res: { valid?: boolean; errors?: string[]; ok?: boolean; message?: string; elapsedMs?: number }) => {
        if ('valid' in res && !res.valid) {
          this.connectionTestStatus = res.errors?.join(' ') || 'Falha ao validar conexão Agromobi.';
          this.connectionTestTone = 'error';
          return;
        }
        if ('ok' in res && res.ok === false) {
          this.connectionTestStatus = res.message || 'Falha ao validar conexão SAP HANA.';
          this.connectionTestTone = 'error';
          return;
        }

        const elapsedMs = Math.round(Number(res?.elapsedMs ?? performance.now() - startedAt));
        const label = source === 'sap' ? 'SAP HANA' : 'Agromobi';
        this.connectionTestStatus = `Conexão ${label} OK (${elapsedMs} ms).`;
        this.connectionTestTone = 'ok';
      },
      error: (err: unknown) => {
        const label = source === 'sap' ? 'SAP HANA' : 'Agromobi';
        this.connectionTestStatus = this.resolveConnectionTestError(err, `Falha ao testar conexão ${label}.`);
        this.connectionTestTone = 'error';
        this.connectionTestLoadingSource = null;
      },
      complete: () => {
        this.connectionTestLoadingSource = null;
      },
    });
  }

  async copyResultsForExcel() {
    this.closeAllMenus();
    if (!this.rows?.length || !this.displayedColumns?.length) return;
    const blob = createXlsxBlob(this.displayedColumns, this.rows || []);

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (
          window as Window & {
            showSaveFilePicker: (opts: unknown) => Promise<{
              name: string;
              createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
            }>;
          }
        ).showSaveFilePicker({
          suggestedName: this.makeFileName('resultado', 'xlsx'),
          types: [
            {
              description: 'Arquivo Excel',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.snack(`Arquivo ${handle.name} salvo.`);
        return;
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.makeFileName('resultado', 'xlsx');
    a.click();
    URL.revokeObjectURL(a.href);
    this.snack('Download de resultado.xlsx concluído.');
  }

  async saveQueryAsSql() {
    this.closeAllMenus();
    const q = (this.query || '').trim();
    if (!q) return;

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (
          window as Window & {
            showSaveFilePicker: (opts: unknown) => Promise<{
              createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
            }>;
          }
        ).showSaveFilePicker({
          suggestedName: this.makeFileName('consulta', 'sql'),
          types: [{ description: 'SQL', accept: { 'text/sql': ['.sql'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([q + '\n'], { type: 'text/sql;charset=utf-8' }));
        await writable.close();
        this.lastSavedQuery = q;
        this.snack('Consulta salva com sucesso.');
        return;
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
    }

    const blob = new Blob([q + '\n'], { type: 'text/sql;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.makeFileName('consulta', 'sql');
    a.click();
    URL.revokeObjectURL(a.href);
    this.lastSavedQuery = q;
    this.snack('Arquivo .sql baixado.');
  }

  saveAsReport() {
    this.closeAllMenus();
    const sql = (this.query || '').trim();
    if (!sql) {
      this.snack('Nada para salvar como relatório.');
      return;
    }

    try {
      localStorage.setItem(REPORT_DRAFT_SQL_KEY, sql);
    } catch {}

    this.router.navigate(['/reports/manage']);
  }

  private makeFileName(prefix: string, ext: string) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
      d.getHours()
    )}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }

  snack(msg: string) {
    this.snackBar.open(msg, 'OK', { duration: 1500 });
  }

  private resolveConnectionTestError(err: unknown, fallback: string): string {
    const error = (err as { error?: { message?: string; error?: string } | string })?.error;
    if (typeof error === 'string') return error;
    if (typeof error?.message === 'string') return error.message;
    if (typeof error?.error === 'string') return error.error;
    return fallback;
  }

  saveOnSelectedSnippet() {
    this.closeAllMenus();
    const sql = (this.query || '').trim();
    if (!sql) {
      this.snack('Nada para salvar.');
      return;
    }

    if (!this.selectedSnippetId) {
      this.saveCurrentAsSnippet();
      return;
    }

    const existing = this.snippetsStore.get(this.selectedSnippetId);
    if (!existing) {
      this.saveCurrentAsSnippet();
      return;
    }

    this.snippetsStore.upsert({
      id: existing.id,
      name: existing.name,
      sql,
    });

    this.refreshSnippets();
    this.lastSavedQuery = sql;
    this.snack(`Snippet "${existing.name}" atualizado.`);
  }

  openScheduleDialog() {
    this.closeAllMenus();
    const dialogRef = this.dialog.open(EmailScheduleDialogComponent, {
      data: { sql: this.query ?? '' },
      width: '1024px',
      maxWidth: '98vw',
    });

    dialogRef.afterClosed().subscribe((result?: EmailScheduleResult) => {
      if (!result) return;
      const payload = {
        sql: result.sql,
        secondSql: result.secondSql || undefined,
        compareWithSap: result.compareWithSap,
        comparisonKey: result.comparisonKey || undefined,
        comparisonTolerances: Object.keys(result.comparisonTolerances || {}).length
          ? result.comparisonTolerances
          : undefined,
        sendOnlyIfDifferent: result.sendOnlyIfDifferent,
        comparisonTitle: result.comparisonTitle || undefined,
        comparisonNote: result.comparisonNote || undefined,
        to: result.to,
        cc: result.cc,
        subject: result.subject,
        message: result.message || undefined,
        reportId: result.reportId || undefined,
        attachPdf: result.attachPdf,
        pdfMode: result.attachPdf ? result.pdfMode : undefined,
        pdfTitle: result.pdfTitle || undefined,
        pdfSubtitle: result.pdfSubtitle || undefined,
        pdfIncludeSummary: result.attachPdf ? result.pdfIncludeSummary : undefined,
        pdfMaxRows: result.attachPdf ? result.pdfMaxRows : undefined,
        attachXlsx: result.attachXlsx,
        time: result.time || undefined,
        days: result.days?.length ? result.days : undefined,
        asDict: true,
        withDescription: true,
      };

      this.api.sendEmail(payload).subscribe({
        next: (res) => {
          if (res.status === 'scheduled') {
            const nxt = res.nextRun ? `Próxima: ${res.nextRun}` : '';
            this.snack(`Agendado com sucesso. ${nxt}`);
          } else if (res.status === 'skipped') {
            this.snack('Envio ignorado: sem dados ou sem divergência.');
          } else {
            this.snack('Relatório enviado por e-mail.');
          }
        },
        error: () => {
          this.snack('Falha ao agendar ou enviar.');
        },
      });
    });
  }
  moveSnippetToFolder(id: string) { this.snippetsLogic.moveSnippetToFolder(id); }

  folderLabel(folder: string | null): string {
    if (folder === null) return 'Todas as pastas';
    return folder ? folder : 'Sem pasta';
  }

  selectFolder(folder: string | null) { this.snippetsLogic.selectFolder(folder); }

  createFolder() { this.snippetsLogic.createFolder(); }

  toggleSnippetsPanel() { this.snippetsLogic.toggleSnippetsPanel(); }

  toggleExecuteMenu() {
    this.executeMenuOpen = !this.executeMenuOpen;
    if (this.executeMenuOpen) {
      this.saveMenuOpen = false;
      this.exportMenuOpen = false;
      this.snippetMenuOpenId = null;
    }
  }

  toggleSaveMenu() {
    this.saveMenuOpen = !this.saveMenuOpen;
    if (this.saveMenuOpen) {
      this.executeMenuOpen = false;
      this.exportMenuOpen = false;
      this.snippetMenuOpenId = null;
    }
  }

  toggleExportMenu() {
    this.exportMenuOpen = !this.exportMenuOpen;
    if (this.exportMenuOpen) {
      this.executeMenuOpen = false;
      this.saveMenuOpen = false;
      this.snippetMenuOpenId = null;
    }
  }

  closeAllMenus() {
    this.executeMenuOpen = false;
    this.saveMenuOpen = false;
    this.exportMenuOpen = false;
    this.snippetMenuOpenId = null;
  }

  get editorCursorLabel(): string {
    return `Ln ${this.cursorLine}, Col ${this.cursorColumn}`;
  }

  get runStatusLabel(): string {
    if (this.loading) return 'Executando consulta...';
    if (!this.lastRunAt) return 'Aguardando execução.';
    const stamp = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(this.lastRunAt);
    return (
      `${this.rowCount} ${this.rowCount === 1 ? 'linha retornada' : 'linhas retornadas'} • ` +
      `${this.elapsedMs} ms • Executado às ${stamp}`
    );
  }

  get runStatusIcon(): string {
    if (this.loading) return '⏳';
    if (!this.lastRunAt) return '•';
    return '✔';
  }

  get sanitizedRunAllDisplayLimit(): number {
    const n = Number(this.runAllDisplayLimit);
    if (!Number.isFinite(n) || n < 100) return this.defaultRunAllDisplayLimit;
    return Math.min(this.maxRunAllDisplayLimit, Math.trunc(n));
  }

  get hasUnsavedChanges(): boolean {
    return (this.query || '').trim() !== (this.lastSavedQuery || '').trim();
  }

  get hasExecutedAtLeastOnce(): boolean {
    return this.lastRunAt !== null || this.lastExecutedSql !== null;
  }

  onRunAllLimitChange() {
    const n = Number(this.runAllDisplayLimit);
    if (!Number.isFinite(n) || n < 100) this.runAllDisplayLimit = this.defaultRunAllDisplayLimit;
    else this.runAllDisplayLimit = Math.min(this.maxRunAllDisplayLimit, Math.trunc(n));
  }

  onSnippetDragStart(event: DragEvent, id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', sn.sql || '');
    event.dataTransfer.effectAllowed = 'copy';
  }

  onEditorDragOver(event: DragEvent) { this.editorLogic.onEditorDragOver(event); }

  onEditorDrop(event: DragEvent) {
    this.editorLogic.onEditorDrop(event, this.editor);
    this.snack('Snippet inserido no editor.');
  }

  onEditorDragLeave(event: DragEvent) { this.editorLogic.onEditorDragLeave(event); }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.menu-wrap') || target.closest('.snippet-menu-wrap')) return;
    this.closeAllMenus();
  }

  private restoreSnippetsCollapsedState() {
    try {
      this.snippetsCollapsed = localStorage.getItem(SNIPPETS_COLLAPSED_KEY) === '1';
    } catch {
      this.snippetsCollapsed = false;
    }
  }

  persistSnippetsCollapsedState() {
    try {
      localStorage.setItem(SNIPPETS_COLLAPSED_KEY, this.snippetsCollapsed ? '1' : '0');
    } catch {}
  }

  shouldShowSnippet(sn: QuerySnippet): boolean { return this.snippetsLogic.shouldShowSnippet(sn); }

  get filteredSnippets(): QuerySnippet[] {
    return this.snippets.filter((sn) => this.shouldShowSnippet(sn));
  }

  folderCount(folder: string | null): number { return this.snippetsLogic.folderCount(folder); }

  toggleSnippetMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    this.closeAllMenus();
    this.snippetMenuOpenId = this.snippetMenuOpenId === id ? null : id;
  }

  renameSnippetFromMenu(id: string) {
    this.snippetMenuOpenId = null;
    this.renameSnippet(id);
  }

  moveSnippetFromMenu(id: string) {
    this.snippetMenuOpenId = null;
    this.moveSnippetToFolder(id);
  }

  deleteSnippetFromMenu(id: string) {
    this.snippetMenuOpenId = null;
    this.deleteSnippet(id);
  }

  duplicateSnippet(id: string) { this.snippetsLogic.duplicateSnippet(id); }

  snippetPreview(sn: QuerySnippet): string {
    const compactSql = (sn.sql || '').replace(/\s+/g, ' ').trim();
    const preview = compactSql.length > 160 ? `${compactSql.slice(0, 160)}...` : compactSql;
    return `${sn.name}\n\n${preview}`;
  }

  exportSnippets() { this.snippetsLogic.exportSnippets((prefix, ext) => this.makeFileName(prefix, ext)); }

  importSnippets() { this.snippetsLogic.importSnippets(); }

  private updateVariableNamesFromQuery() { this.editorLogic.updateVariableNamesFromQuery(); }

  private buildVariablesMap(): Record<string, unknown> {
    return buildVariablesMap(this.variableNames, this.variablesRaw);
  }

  private openParamsDialog(): Promise<boolean> {
    this.updateVariableNamesFromQuery();

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
