import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { DbInspectorService } from '../../services/db-inspector.service';
import { finalize } from 'rxjs/operators';
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

const STORAGE_KEY = 'dbi.query.state';
const SNIPPETS_COLLAPSED_KEY = 'dbi.query.snippets_collapsed';
const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;
const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';

@Component({
  selector: 'app-query-runner',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressBarModule,
    MatCardModule,
    MatTableModule,
    MatSnackBarModule,
    MonacoEditorModule,
    MatDialogModule,
    MatIconModule,
    AppButtonComponent,
  ],
  templateUrl: './query-runner.html',
  styleUrls: ['./query-runner.css'],
})
export class QueryRunnerComponent implements OnInit, OnDestroy {
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
  rows: any[] = [];
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
  lastSavedQuery = '';
  private lastExecutedSql: string | null = null;

  constructor(
    private api: DbInspectorService,
    private snackBar: MatSnackBar,
    private snippetsStore: SnippetStorageService,
    private dialog: MatDialog,
    private router: Router
  ) {}

  snippets: QuerySnippet[] = [];
  snippetsCollapsed = false;
  snippetFilter = '';
  selectedSnippetId: string | null = null;
  folders: string[] = [];
  selectedFolder: string | null = null;
  isDraggingSnippetOverEditor = false;
  private editor!: any;
  private saveTimer: any = null;
  trackSnippetId = (_: number, s: QuerySnippet) => s.id;
  trackFolder = (_: number, folder: string) => folder;
  query = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.query ?? 'SELECT 1 AS ok;';

  ngOnInit() {
    this.restoreSnippetsCollapsedState();
    this.lastSavedQuery = this.query;
    // Load stored snippets immediately so the snippets panel renders without waiting for Monaco.
    this.refreshSnippets();
  }

  onEditorInit(editor: any) {
    const monaco = (window as any).monaco;
    this.editor = editor;
    if (monaco?.editor?.defineTheme) {
      monaco.editor.defineTheme('dbi-sql-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editorLineNumber.foreground': '#64748b',
          'editorLineNumber.activeForeground': '#94a3b8',
        },
      });
      monaco.editor.setTheme('dbi-sql-dark');
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.runPaged());

    const saved = this.loadState();
    if (saved?.viewState) {
      try {
        editor.restoreViewState(saved.viewState);
        editor.focus();
      } catch {}
    }

    this.updateVariableNamesFromQuery();

    editor.onDidChangeModelContent(() => {
      this.query = editor.getValue();
      this.updateVariableNamesFromQuery();
      this.schedulePersist();
    });

    editor.onDidChangeCursorPosition((evt: any) => {
      this.cursorLine = evt?.position?.lineNumber ?? 1;
      this.cursorColumn = evt?.position?.column ?? 1;
    });

    const pos = editor.getPosition?.();
    this.cursorLine = pos?.lineNumber ?? 1;
    this.cursorColumn = pos?.column ?? 1;
  }

  private refreshSnippets() {
    this.snippets = this.snippetsStore.list();
    this.recomputeFolders();
  }

  private recomputeFolders() {
    const bucket = new Set<string>();
    for (const sn of this.snippets) {
      bucket.add(this.normalizeFolder(sn.folder));
    }
    if (this.selectedFolder !== null) {
      bucket.add(this.normalizeFolder(this.selectedFolder));
    }
    const list = Array.from(bucket.values()).sort((a, b) => {
      if (!a && b) return -1;
      if (a && !b) return 1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    this.folders = list;
  }

  ngOnDestroy() {
    this.persistState();
  }

  saveCurrentAsSnippet() {
    const sql = (this.query || '').trim();
    if (!sql) {
      this.snack('Nada para salvar.');
      return;
    }

    let suggestedName = 'Consulta sem título';

    while (true) {
      const input = prompt('Nome do snippet:', suggestedName);
      if (input === null) {
        return;
      }

      const name = input.trim();
      if (!name) {
        this.snack('Informe um nome.');
        suggestedName = 'Consulta sem título';
        continue;
      }

      suggestedName = name;

      const existing = this.snippets.find(
        (s) => s.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (!existing) {
        const saved = this.snippetsStore.upsert({
          name,
          sql,
          folder: this.selectedFolder ?? '',
        });
        this.refreshSnippets();
        this.selectedSnippetId = saved.id;
        this.lastSavedQuery = sql;
        this.snack('Snippet salvo.');
        return;
      }

      const overwrite = confirm(
        `Já existe um snippet chamado "${name}".\n\n` + 'Deseja sobrescrever esse snippet?'
      );

      if (overwrite) {
        const saved = this.snippetsStore.upsert({
          id: existing.id,
          name,
          sql,
          folder: this.selectedFolder ?? existing.folder ?? '',
        });
        this.refreshSnippets();
        this.selectedSnippetId = saved.id;
        this.lastSavedQuery = sql;
        this.snack('Snippet atualizado.');
        return;
      }
    }
  }

  loadSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    this.selectedSnippetId = id;
    this.query = sn.sql;
    this.editor?.setValue(sn.sql);
    this.lastSavedQuery = sn.sql;
    this.updateVariableNamesFromQuery();
    this.persistState();
    this.snack(`Carregado: ${sn.name}`);
  }

  renameSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    const name = prompt('Renomear snippet:', sn.name);
    if (!name) return;
    this.snippetsStore.rename(id, name.trim());
    this.refreshSnippets();
  }

  deleteSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    if (!confirm(`Excluir "${sn.name}"?`)) return;
    this.snippetsStore.remove(id);
    if (this.selectedSnippetId === id) this.selectedSnippetId = null;
    this.refreshSnippets();
  }

  private schedulePersist() {
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

  private persistState() {
    try {
      const viewState = this.editor?.saveViewState?.();
      const payload = { query: this.query ?? '', viewState };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  private loadState(): { query: string; viewState?: any } | null {
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

    const ok = await this.openParamsDialog();
    if (!ok) {
      return;
    }

    const vars = this.buildVariablesMap();

    let finalSql: string;
    try {
      finalSql = this.expandVariables(q, vars);
    } catch (e: any) {
      this.error = e?.message || 'Erro ao expandir variáveis.';
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
            this.rows = displayData.map((v: any) => ({ value: v }));
          }
          if (this.allModeTruncated) {
            this.snack(
              `Mostrando ${this.rows.length} de ${this.rowCount} linhas para manter a interface responsiva.`
            );
          }
        },
        error: (err: any) => {
          this.elapsedMs = Math.round(performance.now() - t0);
          this.error = err?.error?.message || 'Falha ao executar a consulta.';
        },
      });
  }

  async copyResultsForExcel() {
    this.closeAllMenus();
    if (!this.rows?.length || !this.displayedColumns?.length) return;
    const blob = createXlsxBlob(this.displayedColumns, this.rows || []);

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
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
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
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
        const handle = await (window as any).showSaveFilePicker({
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
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
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

  private snack(msg: string) {
    this.snackBar.open(msg, 'OK', { duration: 1500 });
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
        ...result,
        asDict: true,
        withDescription: true,
      };

      this.api.sendEmail(payload).subscribe({
        next: (res) => {
          if (res.status === 'scheduled') {
            const nxt = res.nextRun ? `Próxima: ${res.nextRun}` : '';
            this.snack(`Agendado com sucesso. ${nxt}`);
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
  moveSnippetToFolder(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    const current = sn.folder ?? '';
    const input = prompt('Mover para qual pasta? (vazio = sem pasta)', current);
    if (input === null) return;
    const target = this.normalizeFolder(input);
    this.snippetsStore.moveToFolder(id, target);
    this.selectedFolder = target;
    this.refreshSnippets();
    this.snack(target ? `Movido para "${target}".` : 'Movido para "Sem pasta".');
  }

  folderLabel(folder: string | null): string {
    if (folder === null) return 'Todas as pastas';
    return folder ? folder : 'Sem pasta';
  }

  selectFolder(folder: string | null) {
    this.selectedFolder = folder;
    this.snippetMenuOpenId = null;
    this.recomputeFolders();
  }

  createFolder() {
    const input = prompt('Nome da nova pasta:');
    if (input === null) return;
    const name = this.normalizeFolder(input);
    if (!name) {
      this.snack('Informe um nome para a pasta.');
      return;
    }
    this.selectedFolder = name;
    this.recomputeFolders();
    this.snack(`Pasta "${name}" criada. Salve ou mova favoritos para ela.`);
  }

  toggleSnippetsPanel() {
    this.snippetsCollapsed = !this.snippetsCollapsed;
    this.persistSnippetsCollapsedState();
  }

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

  onEditorDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingSnippetOverEditor = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onEditorDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingSnippetOverEditor = false;
    const sql = event.dataTransfer?.getData('text/plain') ?? '';
    if (!sql.trim()) return;
    if (!this.editor) {
      this.query = `${(this.query || '').trim()}\n\n${sql.trim()}\n`;
      return;
    }

    const selection = this.editor.getSelection?.();
    const range = selection ?? this.editor.getModel?.()?.getFullModelRange?.();
    this.editor.executeEdits('snippet-drop', [{ range, text: sql }]);
    this.editor.focus?.();
    this.snack('Snippet inserido no editor.');
  }

  onEditorDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget) {
      this.isDraggingSnippetOverEditor = false;
      return;
    }
    if (!(event.currentTarget as HTMLElement)?.contains(relatedTarget)) {
      this.isDraggingSnippetOverEditor = false;
    }
  }

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

  private persistSnippetsCollapsedState() {
    try {
      localStorage.setItem(SNIPPETS_COLLAPSED_KEY, this.snippetsCollapsed ? '1' : '0');
    } catch {}
  }

  shouldShowSnippet(sn: QuerySnippet): boolean {
    const matchesFolder =
      this.selectedFolder === null
        ? true
        : this.folderKey(sn.folder) === this.folderKey(this.selectedFolder);
    const term = this.snippetFilter.trim().toLowerCase();
    const matchesFilter = !term || sn.name.toLowerCase().includes(term);
    return matchesFolder && matchesFilter;
  }

  get filteredSnippets(): QuerySnippet[] {
    return this.snippets.filter((sn) => this.shouldShowSnippet(sn));
  }

  folderCount(folder: string | null): number {
    if (folder === null) return this.snippets.length;
    const key = this.folderKey(folder);
    return this.snippets.filter((sn) => this.folderKey(sn.folder) === key).length;
  }

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

  duplicateSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;

    const base = `${sn.name} (cópia)`;
    let name = base;
    let i = 2;
    const existingNames = new Set(this.snippets.map((s) => s.name.trim().toLowerCase()));
    while (existingNames.has(name.trim().toLowerCase())) {
      name = `${base} ${i++}`;
    }

    const created = this.snippetsStore.upsert({
      name,
      sql: sn.sql,
      folder: sn.folder,
    });
    this.refreshSnippets();
    this.selectedSnippetId = created.id;
    this.snippetMenuOpenId = null;
    this.snack('Snippet duplicado.');
  }

  snippetPreview(sn: QuerySnippet): string {
    const compactSql = (sn.sql || '').replace(/\s+/g, ' ').trim();
    const preview = compactSql.length > 160 ? `${compactSql.slice(0, 160)}...` : compactSql;
    return `${sn.name}\n\n${preview}`;
  }

  private normalizeFolder(folder: string | null | undefined): string {
    return (folder ?? '').trim();
  }

  private folderKey(folder: string | null | undefined): string {
    return this.normalizeFolder(folder).toLowerCase();
  }

  exportSnippets() {
    try {
      const json = this.snippetsStore.export() || '[]';
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = this.makeFileName('snippets', 'json');
      a.click();
      URL.revokeObjectURL(a.href);
      this.snack('Snippets exportados.');
    } catch {
      this.snack('Falha ao exportar snippets.');
    }
  }

  importSnippets() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }

      try {
        const text = await file.text();
        this.snippetsStore.import(text);
        this.selectedSnippetId = null;
        this.refreshSnippets();
        this.snack('Snippets importados.');
      } catch {
        this.snack('Arquivo de snippets inválido.');
      } finally {
        input.remove();
      }
    });

    input.click();
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

  private expandVariables(sql: string, vars: Record<string, any>): string {
    return sql.replace(SQL_VARIABLE_RE, (full, prefix, name) => {
      if (!(name in vars)) return full;

      const value = vars[name];

      if (value === null || value === undefined) {
        return `${prefix}NULL`;
      }

      if (value instanceof Date) {
        const s = this.formatDateTime(value);
        const escaped = s.replace(/'/g, "''");
        return `${prefix}'${escaped}'`;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new Error(`Valor numérico inválido para :${name}`);
        }
        return `${prefix}${value}`;
      }

      if (typeof value === 'boolean') {
        return `${prefix}${value ? 'TRUE' : 'FALSE'}`;
      }

      const s = String(value).replace(/'/g, "''");
      return `${prefix}'${s}'`;
    });
  }

  private updateVariableNamesFromQuery() {
    const sql = this.query || '';
    const names = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = SQL_VARIABLE_RE.exec(sql)) !== null) {
      names.add(match[2]);
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
