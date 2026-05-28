import { QuerySnippet, SnippetStorageService } from '../../services/snippet-storage.service';

export interface QueryRunnerSnippetsHost {
  query: string;
  snippets: QuerySnippet[];
  snippetsCollapsed: boolean;
  snippetFilter: string;
  selectedSnippetId: string | null;
  folders: string[];
  selectedFolder: string | null;
  snippetMenuOpenId: string | null;
  editor?: { setValue: (value: string) => void };
  lastSavedQuery: string;
  closeAllMenus(): void;
  snack(msg: string): void;
  persistState(): void;
  persistSnippetsCollapsedState(): void;
}

export class QueryRunnerSnippetsLogic {
  constructor(
    private readonly host: QueryRunnerSnippetsHost,
    private readonly snippetsStore: SnippetStorageService
  ) {}

  refreshSnippets() {
    this.host.snippets = this.snippetsStore.list();
    this.recomputeFolders();
  }

  recomputeFolders() {
    const bucket = new Set<string>();
    for (const sn of this.host.snippets) bucket.add(this.normalizeFolder(sn.folder));
    if (this.host.selectedFolder !== null) bucket.add(this.normalizeFolder(this.host.selectedFolder));
    const list = Array.from(bucket.values()).sort((a, b) => {
      if (!a && b) return -1;
      if (a && !b) return 1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    this.host.folders = list;
  }

  saveCurrentAsSnippet() {
    const sql = (this.host.query || '').trim();
    if (!sql) {
      this.host.snack('Nada para salvar.');
      return;
    }

    let suggestedName = 'Consulta sem título';
    while (true) {
      const input = prompt('Nome do snippet:', suggestedName);
      if (input === null) return;
      const name = input.trim();
      if (!name) {
        this.host.snack('Informe um nome.');
        suggestedName = 'Consulta sem título';
        continue;
      }
      suggestedName = name;
      const existing = this.host.snippets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
      if (!existing) {
        const saved = this.snippetsStore.upsert({ name, sql, folder: this.host.selectedFolder ?? '' });
        this.refreshSnippets();
        this.host.selectedSnippetId = saved.id;
        this.host.lastSavedQuery = sql;
        this.host.snack('Snippet salvo.');
        return;
      }
      const overwrite = confirm(`Já existe um snippet chamado "${name}".\n\nDeseja sobrescrever esse snippet?`);
      if (overwrite) {
        const saved = this.snippetsStore.upsert({
          id: existing.id,
          name,
          sql,
          folder: this.host.selectedFolder ?? existing.folder ?? '',
        });
        this.refreshSnippets();
        this.host.selectedSnippetId = saved.id;
        this.host.lastSavedQuery = sql;
        this.host.snack('Snippet atualizado.');
        return;
      }
    }
  }

  loadSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    this.host.selectedSnippetId = id;
    this.host.query = sn.sql;
    this.host.editor?.setValue(sn.sql);
    this.host.lastSavedQuery = sn.sql;
    this.host.persistState();
    this.host.snack(`Carregado: ${sn.name}`);
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
    if (this.host.selectedSnippetId === id) this.host.selectedSnippetId = null;
    this.refreshSnippets();
  }

  selectFolder(folder: string | null) {
    this.host.selectedFolder = folder;
    this.host.snippetMenuOpenId = null;
    this.recomputeFolders();
  }

  createFolder() {
    const input = prompt('Nome da nova pasta:');
    if (input === null) return;
    const name = this.normalizeFolder(input);
    if (!name) {
      this.host.snack('Informe um nome para a pasta.');
      return;
    }
    this.host.selectedFolder = name;
    this.recomputeFolders();
    this.host.snack(`Pasta "${name}" criada. Salve ou mova favoritos para ela.`);
  }

  toggleSnippetsPanel() {
    this.host.snippetsCollapsed = !this.host.snippetsCollapsed;
    this.host.persistSnippetsCollapsedState();
  }

  moveSnippetToFolder(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    const current = sn.folder ?? '';
    const input = prompt('Mover para qual pasta? (vazio = sem pasta)', current);
    if (input === null) return;
    const target = this.normalizeFolder(input);
    this.snippetsStore.moveToFolder(id, target);
    this.host.selectedFolder = target;
    this.refreshSnippets();
    this.host.snack(target ? `Movido para "${target}".` : 'Movido para "Sem pasta".');
  }

  shouldShowSnippet(sn: QuerySnippet): boolean {
    const matchesFolder =
      this.host.selectedFolder === null
        ? true
        : this.folderKey(sn.folder) === this.folderKey(this.host.selectedFolder);
    const term = this.host.snippetFilter.trim().toLowerCase();
    const matchesFilter = !term || sn.name.toLowerCase().includes(term);
    return matchesFolder && matchesFilter;
  }

  folderCount(folder: string | null): number {
    if (folder === null) return this.host.snippets.length;
    const key = this.folderKey(folder);
    return this.host.snippets.filter((sn) => this.folderKey(sn.folder) === key).length;
  }

  duplicateSnippet(id: string) {
    const sn = this.snippetsStore.get(id);
    if (!sn) return;
    const base = `${sn.name} (cópia)`;
    let name = base;
    let i = 2;
    const existingNames = new Set(this.host.snippets.map((s) => s.name.trim().toLowerCase()));
    while (existingNames.has(name.trim().toLowerCase())) name = `${base} ${i++}`;
    const created = this.snippetsStore.upsert({ name, sql: sn.sql, folder: sn.folder });
    this.refreshSnippets();
    this.host.selectedSnippetId = created.id;
    this.host.snippetMenuOpenId = null;
    this.host.snack('Snippet duplicado.');
  }

  exportSnippets(makeFileName: (prefix: string, ext: string) => string) {
    try {
      const json = this.snippetsStore.export() || '[]';
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = makeFileName('snippets', 'json');
      a.click();
      URL.revokeObjectURL(a.href);
      this.host.snack('Snippets exportados.');
    } catch {
      this.host.snack('Falha ao exportar snippets.');
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
        this.host.selectedSnippetId = null;
        this.refreshSnippets();
        this.host.snack('Snippets importados.');
      } catch {
        this.host.snack('Arquivo de snippets inválido.');
      } finally {
        input.remove();
      }
    });
    input.click();
  }

  private normalizeFolder(folder: string | null | undefined): string {
    return (folder ?? '').trim();
  }

  private folderKey(folder: string | null | undefined): string {
    return this.normalizeFolder(folder).toLowerCase();
  }
}
