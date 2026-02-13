import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { DbInspectorService } from '../../services/db-inspector.service';
import { finalize } from 'rxjs/operators';
import { SnippetStorageService, QuerySnippet } from '../../services/snippet-storage.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { QueryParam, QueryParamsDialog } from '../query-params-dialog/query-params-dialog';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import {
  EmailScheduleDialogComponent,
  EmailScheduleResult,
} from '../email-schedules/email-schedule-dialog';
import { MatIconModule } from '@angular/material/icon';

const STORAGE_KEY = 'dbi.query.state';
const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;
const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';

@Component({
  selector: 'app-query-runner',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatProgressBarModule,
    MatCardModule,
    MatTableModule,
    MatSnackBarModule,
    MonacoEditorModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatIconModule,
  ],
  templateUrl: './query-runner.html',
  styleUrls: ['./query-runner.css'],
})
export class QueryRunnerComponent implements OnInit, OnDestroy {
  editorOptions = {
    language: 'sql',
    theme: 'vs-dark',
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
  raw: any = null;

  copied = false;

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
  private editor!: any;
  private saveTimer: any = null;
  trackSnippetId = (_: number, s: QuerySnippet) => s.id;
  trackFolder = (_: number, folder: string) => folder;
  query = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.query ?? 'SELECT 1 AS ok;';

  ngOnInit() {
    // Load stored snippets immediately so the favorites bar renders without waiting for Monaco.
    this.refreshSnippets();
  }

  onEditorInit(editor: any) {
    const monaco = (window as any).monaco;
    this.editor = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.run());

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

  onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.saveCurrentAsSnippet();
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

  async run() {
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

    this.loading = true;
    this.error = null;
    this.rows = [];
    this.displayedColumns = [];
    this.raw = null;
    this.rowCount = 0;
    this.elapsedMs = 0;

    const t0 = performance.now();
    this.api
      .runQuery(finalSql)
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
          if (data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
            this.displayedColumns = Object.keys(data[0]);
            this.rows = data;
          } else {
            this.displayedColumns = ['value'];
            this.rows = data.map((v: any) => ({ value: v }));
          }
        },
        error: () => {
          this.elapsedMs = Math.round(performance.now() - t0);
          this.error = 'Falha ao executar a consulta.';
        },
      });
  }

  async copyResultsForExcel() {
    if (!this.rows?.length || !this.displayedColumns?.length) return;

    const cols = this.displayedColumns;
    const esc = (v: any) => (v == null ? '' : String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
    const header = cols.join('\t');
    const lines = this.rows.map((r) => cols.map((c) => esc(r[c])).join('\t'));
    const tsv = [header, ...lines].join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1200);
      this.snack('Copiado para a área de transferência.');
      return;
    } catch {}

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: this.makeFileName('resultado', 'tsv'),
          types: [
            {
              description: 'Arquivo TSV',
              accept: { 'text/tab-separated-values': ['.tsv'] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(
          new Blob([tsv], {
            type: 'text/tab-separated-values;charset=utf-8',
          })
        );
        await writable.close();
        this.snack(`Arquivo ${handle.name} salvo.`);
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }

    const blob = new Blob([tsv], {
      type: 'text/tab-separated-values;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.makeFileName('resultado', 'tsv');
    a.click();
    URL.revokeObjectURL(a.href);
    this.snack('Download de resultado.tsv concluído.');
  }

  async saveQueryAsSql() {
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
    this.snack('Arquivo .sql baixado.');
  }

  saveAsReport() {
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
    this.snack(`Snippet "${existing.name}" atualizado.`);
  }

  openScheduleDialog() {
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
  }

  shouldShowSnippet(sn: QuerySnippet): boolean {
    const matchesFolder =
      this.selectedFolder === null
        ? true
        : this.normalizeFolder(sn.folder) === this.normalizeFolder(this.selectedFolder);
    const term = this.snippetFilter.trim().toLowerCase();
    const matchesFilter = !term || sn.name.toLowerCase().includes(term);
    return matchesFolder && matchesFilter;
  }

  private normalizeFolder(folder: string | null | undefined): string {
    return (folder ?? '').trim();
  }

  exportSnippets() {
    try {
      const json = this.snippetsStore.export() || '[]';
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = this.makeFileName('favoritos', 'json');
      a.click();
      URL.revokeObjectURL(a.href);
      this.snack('Favoritos exportados.');
    } catch {
      this.snack('Falha ao exportar favoritos.');
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
        this.snack('Favoritos importados.');
      } catch {
        this.snack('Arquivo de favoritos inválido.');
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
