import { Component, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
const STORAGE_KEY = 'dbi.query.state';

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
    DatePipe,
  ],
  templateUrl: './query-runner.html',
  styleUrls: ['./query-runner.css'],
})
export class QueryRunnerComponent implements OnDestroy {
  editorOptions = {
    language: 'sql',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    fontSize: 14,
    readOnly: false,
  };

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
    private snippetsStore: SnippetStorageService
  ) {}
  snippets: QuerySnippet[] = [];
  snippetFilter = '';
  selectedSnippetId: string | null = null;
  private editor!: any;
  private saveTimer: any = null;
  trackSnippetId = (_: number, s: QuerySnippet) => s.id;
  query = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.query ?? 'SELECT 1 AS ok;';

  onEditorInit(editor: any) {
    const monaco = (window as any).monaco;
    this.editor = editor;
    this.refreshSnippets();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.run());

    const saved = this.loadState();
    if (saved?.viewState) {
      try {
        editor.restoreViewState(saved.viewState);
        editor.focus();
      } catch {}
    }

    editor.onDidChangeModelContent(() => {
      this.query = editor.getValue();
      this.schedulePersist();
    });
  }

  private refreshSnippets() {
    this.snippets = this.snippetsStore.list();
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
        this.snippetsStore.upsert({ name, sql });
        this.refreshSnippets();
        this.snack('Snippet salvo.');
        return;
      }

      const overwrite = confirm(
        `Já existe um snippet chamado "${name}".\n\n` + 'Deseja sobrescrever esse snippet?'
      );

      if (overwrite) {
        this.snippetsStore.upsert({ id: existing.id, name, sql });
        this.refreshSnippets();
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

  run() {
    const q = (this.query || '').trim();
    if (!q) {
      this.error = 'Informe a SQL.';
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
      .runQuery(q)
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
}
