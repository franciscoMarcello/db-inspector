import { extractSqlVariables } from './query-runner.sql-utils';

export interface QueryRunnerEditorHost {
  query: string;
  variableNames: string[];
  cursorLine: number;
  cursorColumn: number;
  isDraggingSnippetOverEditor: boolean;
  persistState(): void;
  schedulePersist(): void;
}

export type QueryEditor = {
  getValue: () => string;
  setValue: (value: string) => void;
  restoreViewState: (state: unknown) => void;
  focus: () => void;
  addCommand: (keybinding: number, handler: () => void) => void;
  onDidChangeModelContent: (listener: () => void) => void;
  onDidChangeCursorPosition: (listener: (evt: { position?: { lineNumber?: number; column?: number } }) => void) => void;
  getPosition?: () => { lineNumber?: number; column?: number } | null;
  saveViewState?: () => unknown;
  getSelection?: () => unknown;
  getModel?: () => { getFullModelRange?: () => unknown } | undefined;
  executeEdits: (source: string, edits: Array<{ range: unknown; text: string }>) => void;
};

export class QueryRunnerEditorLogic {
  constructor(private readonly host: QueryRunnerEditorHost) {}

  updateVariableNamesFromQuery() {
    this.host.variableNames = extractSqlVariables(this.host.query || '');
  }

  onEditorInit(
    editor: QueryEditor,
    monaco: {
      editor?: { defineTheme?: (theme: string, data: unknown) => void; setTheme?: (theme: string) => void };
      KeyMod: { CtrlCmd: number };
      KeyCode: { Enter: number };
    },
    loadState: () => { query: string; viewState?: unknown } | null,
    runPaged: () => void
  ) {
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
      monaco.editor.setTheme?.('dbi-sql-dark');
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runPaged());
    const saved = loadState();
    if (saved?.viewState) {
      try {
        editor.restoreViewState(saved.viewState);
        editor.focus();
      } catch {}
    }
    this.updateVariableNamesFromQuery();
    editor.onDidChangeModelContent(() => {
      this.host.query = editor.getValue();
      this.updateVariableNamesFromQuery();
      this.host.schedulePersist();
    });
    editor.onDidChangeCursorPosition((evt) => {
      this.host.cursorLine = evt?.position?.lineNumber ?? 1;
      this.host.cursorColumn = evt?.position?.column ?? 1;
    });
    const pos = editor.getPosition?.();
    this.host.cursorLine = pos?.lineNumber ?? 1;
    this.host.cursorColumn = pos?.column ?? 1;
  }

  onEditorDragOver(event: DragEvent) {
    event.preventDefault();
    this.host.isDraggingSnippetOverEditor = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onEditorDrop(event: DragEvent, editor?: QueryEditor) {
    event.preventDefault();
    this.host.isDraggingSnippetOverEditor = false;
    const sql = event.dataTransfer?.getData('text/plain') ?? '';
    if (!sql.trim()) return;
    if (!editor) {
      this.host.query = `${(this.host.query || '').trim()}\n\n${sql.trim()}\n`;
      return;
    }
    const selection = editor.getSelection?.();
    const range = selection ?? editor.getModel?.()?.getFullModelRange?.();
    editor.executeEdits('snippet-drop', [{ range, text: sql }]);
    editor.focus?.();
  }

  onEditorDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget) {
      this.host.isDraggingSnippetOverEditor = false;
      return;
    }
    if (!(event.currentTarget as HTMLElement)?.contains(relatedTarget)) {
      this.host.isDraggingSnippetOverEditor = false;
    }
  }
}
