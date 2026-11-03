import { NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DiffEditorComponent, DiffEditorModel } from 'ngx-monaco-editor-v2';
import {
  ReportDefinition,
  ReportRunResponse,
  ReportService,
  ReportVariableInput,
  ReportVersion,
  ReportVersionStatus,
  ReportVersionSummary,
} from '../../../../services/report.service';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';
import { ResultTableComponent } from '../../../shared/result-table/result-table.component';
import {
  buildRunParams,
  normalizeFileName,
  StatusTone,
  statusTitleFromTone,
} from '../../core/reports.component.utils';
import { resolveAiErrorMessage } from '../../core/reports.component.ai-utils';

export type ReportVersionAction = 'publish' | 'discard' | 'restore' | 'reuse';

export type ReportVersionsChange = {
  reportId: string;
  action: ReportVersionAction;
  reportDeleted: boolean;
  message: string;
};

export type ReportVersionActionState = {
  preview: boolean;
  pdf: boolean;
  publish: boolean;
  discard: boolean;
  restore: boolean;
  reuse: boolean;
};

export type ReportVersionViewMode = 'content' | 'compare';
export type ReportVersionCompareTarget = 'sql' | 'secondSql' | 'jrxml';

export type PreviewParamSource = 'form' | 'default' | 'empty';

export type PreviewParamRow = {
  key: string;
  label: string;
  value: string;
  source: PreviewParamSource;
};

type VersionFeedback = { tone: StatusTone; message: string };

type VersionDiffView = {
  key: string;
  target: ReportVersionCompareTarget;
  originalLabel: string;
  modifiedLabel: string;
  options: Record<string, unknown>;
  original: DiffEditorModel;
  modified: DiffEditorModel;
};

type MonacoDisposable = { dispose(): void };

type MonacoDiffEditorLike = {
  getModel(): { original: MonacoDisposable; modified: MonacoDisposable } | null;
  onDidDispose(listener: () => void): unknown;
};

const PREVIEW_PAGE_SIZE = 200;

const STATUS_LABELS: Record<ReportVersionStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  SUPERSEDED: 'Substituída',
  DISCARDED: 'Descartada',
  REPLACED_DRAFT: 'Rascunho anterior',
};

const COMPARE_TARGET_LABELS: Record<ReportVersionCompareTarget, string> = {
  sql: 'SQL',
  secondSql: 'SQL secundária',
  jrxml: 'JRXML',
};

const PREVIEW_SOURCE_LABELS: Record<PreviewParamSource, string> = {
  form: 'formulário',
  default: 'padrão',
  empty: 'sem valor',
};

const DIFF_EDITOR_BASE_OPTIONS: Record<string, unknown> = {
  theme: 'vs-dark',
  readOnly: true,
  originalEditable: false,
  automaticLayout: true,
  renderSideBySide: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  fontSize: 13,
};

const NO_ACTIONS: ReportVersionActionState = {
  preview: false,
  pdf: false,
  publish: false,
  discard: false,
  restore: false,
  reuse: false,
};

export function versionStatusLabel(status: ReportVersionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function versionAuthorLabel(
  version: Pick<ReportVersionSummary, 'authorType' | 'authorName'>,
): string {
  if (version.authorType === 'AI_TOKEN') return 'IA';
  if (version.authorType === 'SYSTEM') return 'Sistema';
  return version.authorName.trim() || 'Usuário';
}

export function versionActionsFor(version: ReportVersionSummary | null): ReportVersionActionState {
  if (!version) return NO_ACTIONS;
  return {
    preview: true,
    pdf: version.hasJrxml,
    publish: version.status === 'DRAFT',
    discard: version.status === 'DRAFT',
    restore: version.status === 'SUPERSEDED',
    reuse:
      version.status === 'SUPERSEDED' ||
      version.status === 'DISCARDED' ||
      version.status === 'REPLACED_DRAFT',
  };
}

export function outdatedBaseWarning(
  version: ReportVersionSummary | null,
  published: ReportVersionSummary | null,
): string {
  if (!version || version.status !== 'DRAFT' || !published) return '';
  if (version.baseVersionNumber === published.versionNumber) return '';
  if (version.baseVersionNumber === null) {
    return `Este rascunho foi criado sem versão base; a publicada hoje é a ${published.versionNumber}.`;
  }
  return `Este rascunho foi feito sobre a versão ${version.baseVersionNumber}; a publicada hoje é a ${published.versionNumber}.`;
}

export function pickInitialVersion(
  versions: ReportVersionSummary[],
  preferred: number | null,
): number | null {
  if (preferred !== null && versions.some((version) => version.versionNumber === preferred)) {
    return preferred;
  }
  const draft = versions.find((version) => version.status === 'DRAFT');
  if (draft) return draft.versionNumber;
  const published = versions.find((version) => version.status === 'PUBLISHED');
  if (published) return published.versionNumber;
  return versions[0]?.versionNumber ?? null;
}

export function formatVersionDate(value: number | null): string {
  if (!value || value <= 0) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  } catch {
    return '—';
  }
}

export function sortVersionVariables(variables: ReportVariableInput[]): ReportVariableInput[] {
  return [...variables].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function describePreviewParams(
  variables: ReportVariableInput[],
  inputs: Record<string, string>,
): PreviewParamRow[] {
  return sortVersionVariables(variables).map((variable) => {
    const typed = String(inputs[variable.key] ?? '').trim();
    const fallback = String(variable.defaultValue ?? '').trim();
    const source: PreviewParamSource = typed ? 'form' : fallback ? 'default' : 'empty';
    return {
      key: variable.key,
      label: variable.label || variable.key,
      value: typed || fallback,
      source,
    };
  });
}

function compareText(version: ReportVersion, target: ReportVersionCompareTarget): string {
  if (target === 'secondSql') return version.secondSql ?? '';
  if (target === 'jrxml') return version.jrxml ?? '';
  return version.sql;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-reports-versions-modal',
  standalone: true,
  imports: [NgClass, FormsModule, AppButtonComponent, ResultTableComponent, DiffEditorComponent],
  templateUrl: './reports-versions-modal.component.html',
  styleUrls: [
    './reports-versions-modal.component.css',
    '../../reports-page/reports.component.css',
    '../../reports-page/reports.component.table.css',
    '../../reports-page/reports.component.modals.css',
    '../../reports-page/reports.component.responsive.css',
  ],
})
export class ReportsVersionsModalComponent {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly report = input<ReportDefinition | null>(null);
  readonly paramInputs = input<Record<string, string>>({});

  readonly close = output<void>();
  readonly changed = output<ReportVersionsChange>();

  readonly reportId = computed(() => this.report()?.id ?? null);
  readonly versions = signal<ReportVersionSummary[]>([]);
  readonly loadingList = signal(false);
  readonly listError = signal('');
  readonly selectedNumber = signal<number | null>(null);
  readonly versionError = signal('');
  readonly viewMode = signal<ReportVersionViewMode>('content');
  readonly compareTarget = signal<ReportVersionCompareTarget>('sql');
  readonly preview = signal<ReportRunResponse | null>(null);
  readonly previewVersionNumber = signal<number | null>(null);
  readonly loadingPreview = signal(false);
  readonly loadingPdf = signal(false);
  readonly busyAction = signal<ReportVersionAction | null>(null);
  readonly feedback = signal<VersionFeedback | null>(null);
  readonly note = signal('');

  private readonly versionCache = signal<Record<number, ReportVersion>>({});
  private readonly pendingVersionLoads = new Set<string>();
  private loadedReportId: string | null = null;
  private listLoadSeq = 0;
  // Atualizar descarta o que foi carregado antes: a IA pode ter regravado o mesmo rascunho.
  private cacheGeneration = 0;
  private previewSeq = 0;

  readonly currentPublished = computed(
    () => this.versions().find((version) => version.status === 'PUBLISHED') ?? null,
  );
  readonly selectedSummary = computed(() => {
    const selected = this.selectedNumber();
    if (selected === null) return null;
    return this.versions().find((version) => version.versionNumber === selected) ?? null;
  });
  readonly selectedVersion = computed(() => {
    const selected = this.selectedNumber();
    return selected === null ? null : (this.versionCache()[selected] ?? null);
  });
  readonly publishedVersion = computed(() => {
    const published = this.currentPublished();
    return published ? (this.versionCache()[published.versionNumber] ?? null) : null;
  });
  readonly versionRows = computed(() =>
    this.versions().map((version) => ({
      ...version,
      statusLabel: versionStatusLabel(version.status),
      authorLabel: versionAuthorLabel(version),
      createdLabel: formatVersionDate(version.createdAt),
    })),
  );
  readonly selectedRow = computed(() => {
    const selected = this.selectedNumber();
    return this.versionRows().find((version) => version.versionNumber === selected) ?? null;
  });
  readonly actions = computed(() => versionActionsFor(this.selectedSummary()));
  readonly baseWarning = computed(() =>
    outdatedBaseWarning(this.selectedSummary(), this.currentPublished()),
  );
  readonly busy = computed(
    () => this.busyAction() !== null || this.loadingPreview() || this.loadingPdf(),
  );
  /** Publicar so com a lista atualizada e o conteudo da versao na tela: e o que a pessoa revisou. */
  readonly canPublishNow = computed(
    () =>
      this.actions().publish &&
      !this.busy() &&
      !this.loadingList() &&
      this.selectedVersion()?.versionNumber === this.selectedNumber(),
  );
  readonly compareError = signal('');
  readonly loadingVersion = computed(
    () => this.selectedNumber() !== null && !this.selectedVersion() && !this.versionError(),
  );
  readonly compareUnavailableReason = computed(() => {
    const selected = this.selectedSummary();
    const published = this.currentPublished();
    if (!selected) return 'Selecione uma versão.';
    if (!published) return 'Não há versão publicada para comparar.';
    if (selected.versionNumber === published.versionNumber) {
      return 'Esta já é a versão publicada atual.';
    }
    return '';
  });
  readonly canCompare = computed(() => !this.compareUnavailableReason());
  readonly loadingCompare = computed(
    () =>
      this.viewMode() === 'compare' &&
      this.canCompare() &&
      (!this.publishedVersion() || !this.selectedVersion()) &&
      !this.versionError() &&
      !this.compareError(),
  );
  readonly compareTargets = computed<ReportVersionCompareTarget[]>(() => {
    const selected = this.selectedVersion();
    const published = this.publishedVersion();
    const targets: ReportVersionCompareTarget[] = ['sql'];
    if (selected?.secondSql || published?.secondSql) targets.push('secondSql');
    if (selected?.jrxml || published?.jrxml) targets.push('jrxml');
    return targets;
  });
  readonly effectiveCompareTarget = computed<ReportVersionCompareTarget>(() => {
    const target = this.compareTarget();
    return this.compareTargets().includes(target) ? target : 'sql';
  });
  readonly diffViews = computed<VersionDiffView[]>(() => {
    if (this.viewMode() !== 'compare' || !this.canCompare()) return [];
    const selected = this.selectedVersion();
    const published = this.publishedVersion();
    if (!selected || !published) return [];
    const target = this.effectiveCompareTarget();
    const language = target === 'jrxml' ? 'xml' : 'sql';
    return [
      {
        key: `${published.versionNumber}:${selected.versionNumber}:${target}`,
        target,
        originalLabel: `Publicada v${published.versionNumber}`,
        modifiedLabel: `v${selected.versionNumber} (${versionStatusLabel(selected.status)})`,
        options: { ...DIFF_EDITOR_BASE_OPTIONS, language },
        original: { code: compareText(published, target), language },
        modified: { code: compareText(selected, target), language },
      },
    ];
  });
  readonly variableRows = computed<Record<string, unknown>[]>(() =>
    sortVersionVariables(this.selectedVersion()?.variables ?? []).map((variable) => ({
      key: variable.key,
      label: variable.label,
      type: variable.type,
      required: variable.required ? 'Sim' : 'Não',
      multiple: variable.multiple ? 'Sim' : 'Não',
      defaultValue: variable.defaultValue ?? '',
      optionsSql: variable.optionsSql ?? '',
    })),
  );
  readonly previewParams = computed(() =>
    describePreviewParams(this.selectedVersion()?.variables ?? [], this.paramInputs()),
  );

  readonly variableColumns = [
    'key',
    'label',
    'type',
    'required',
    'multiple',
    'defaultValue',
    'optionsSql',
  ];
  readonly variableColumnLabels: Record<string, string> = {
    key: 'Chave',
    label: 'Rótulo',
    type: 'Tipo',
    required: 'Obrigatória',
    multiple: 'Múltipla',
    defaultValue: 'Padrão',
    optionsSql: 'SQL de opções',
  };
  readonly previewPageSize = PREVIEW_PAGE_SIZE;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const reportId = this.reportId();
      untracked(() => this.handleOpenState(isOpen, reportId));
    });
  }

  statusTitle(tone: StatusTone): string {
    return statusTitleFromTone(tone);
  }

  compareTargetLabel(target: ReportVersionCompareTarget): string {
    return COMPARE_TARGET_LABELS[target];
  }

  previewSourceLabel(source: PreviewParamSource): string {
    return PREVIEW_SOURCE_LABELS[source];
  }

  formatDate(value: number | null): string {
    return formatVersionDate(value);
  }

  jrxmlSizeLabel(jrxml: string | null): string {
    const bytes = new TextEncoder().encode(jrxml ?? '').length;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  closeModal(): void {
    this.close.emit();
  }

  loadVersions(preferredNumber: number | null = this.selectedNumber()): void {
    const reportId = this.reportId();
    if (!reportId) return;
    const seq = ++this.listLoadSeq;
    this.loadingList.set(true);
    this.listError.set('');
    this.invalidateLoadedContent();
    this.reportService
      .listReportVersions(reportId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          if (seq !== this.listLoadSeq || reportId !== this.reportId()) return;
          const sorted = [...list].sort((a, b) => b.versionNumber - a.versionNumber);
          this.versions.set(sorted);
          this.loadingList.set(false);
          this.selectVersion(pickInitialVersion(sorted, preferredNumber));
        },
        error: (err: unknown) => {
          if (seq !== this.listLoadSeq || reportId !== this.reportId()) return;
          this.loadingList.set(false);
          this.versions.set([]);
          this.selectedNumber.set(null);
          this.listError.set(this.describeError(err, 'Falha ao carregar as versões do relatório.'));
        },
      });
  }

  selectVersion(versionNumber: number | null): void {
    if (this.selectedNumber() !== versionNumber) {
      this.clearPreview();
      this.compareError.set('');
      this.note.set('');
    }
    this.selectedNumber.set(versionNumber);
    this.versionError.set('');
    if (versionNumber === null) return;
    this.ensureVersionLoaded(versionNumber);
    if (!this.canCompare()) {
      this.viewMode.set('content');
    } else if (this.viewMode() === 'compare') {
      this.ensurePublishedLoaded();
    }
  }

  setViewMode(mode: ReportVersionViewMode): void {
    if (mode === 'compare' && !this.canCompare()) return;
    this.compareError.set('');
    this.viewMode.set(mode);
    if (mode === 'compare') this.ensurePublishedLoaded();
  }

  setCompareTarget(target: ReportVersionCompareTarget): void {
    this.compareTarget.set(target);
  }

  onDiffEditorInit(editor: MonacoDiffEditorLike): void {
    const model = editor?.getModel?.();
    if (!model) return;
    // O wrapper ngx-monaco-diff-editor cria os modelos e nao os descarta; liberamos apos o dispose do editor.
    editor.onDidDispose(() =>
      queueMicrotask(() => {
        model.original.dispose();
        model.modified.dispose();
      }),
    );
  }

  runPreview(): void {
    const reportId = this.reportId();
    const version = this.selectedVersion();
    if (!reportId || !version || !this.actions().preview || this.busy()) return;
    const params = this.buildPreviewParams(version);
    if (params === null) return;

    const versionNumber = version.versionNumber;
    const seq = ++this.previewSeq;
    this.loadingPreview.set(true);
    this.feedback.set(null);
    this.reportService
      .runReportVersion(reportId, versionNumber, { params, page: 0, size: PREVIEW_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (seq !== this.previewSeq) return;
          this.loadingPreview.set(false);
          if (reportId !== this.reportId()) return;
          this.preview.set(res);
          this.previewVersionNumber.set(versionNumber);
          const rows = Number(res.meta?.rowCount ?? res.rows?.length ?? 0);
          this.setFeedback(
            'status-success',
            `Prévia da versão ${versionNumber} executada (${rows} linhas).`,
          );
        },
        error: (err: unknown) => {
          if (seq !== this.previewSeq) return;
          this.loadingPreview.set(false);
          this.preview.set(null);
          this.previewVersionNumber.set(null);
          this.setFeedback(
            'status-error',
            this.describeError(err, `Falha ao executar a prévia da versão ${versionNumber}.`),
          );
        },
      });
  }

  downloadPdf(): void {
    const reportId = this.reportId();
    const version = this.selectedVersion();
    if (!reportId || !version || !this.actions().pdf || this.busy()) return;
    const params = this.buildPreviewParams(version);
    if (params === null) return;

    const versionNumber = version.versionNumber;
    const baseName = normalizeFileName(this.report()?.name || version.name || '') || 'relatorio';
    this.loadingPdf.set(true);
    this.feedback.set(null);
    this.reportService
      .generateReportVersionPdf(reportId, versionNumber, params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.loadingPdf.set(false);
          downloadBlob(blob, `${baseName}-v${versionNumber}.pdf`);
          this.setFeedback('status-success', `PDF da versão ${versionNumber} gerado.`);
        },
        error: (err: unknown) => {
          this.loadingPdf.set(false);
          this.setFeedback(
            'status-error',
            this.describeError(err, `Falha ao gerar o PDF da versão ${versionNumber}.`),
          );
        },
      });
  }

  publishSelected(): void {
    const reportId = this.reportId();
    const reviewed = this.selectedVersion();
    if (!reportId || !reviewed || !this.canPublishNow()) return;
    const versionNumber = reviewed.versionNumber;
    const published = this.currentPublished();
    const replaces = published ? ` e substitui a versão ${published.versionNumber}` : '';
    const ok = confirm(
      `Publicar a versão ${versionNumber}?\n\n` +
        `Ela passa a ser a versão em uso do relatório${replaces}.`,
    );
    if (!ok) return;

    this.busyAction.set('publish');
    this.feedback.set(null);
    this.reportService
      .publishReportVersion(reportId, versionNumber, reviewed.revision, this.note())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (version) => {
          this.busyAction.set(null);
          const message = `Versão ${version.versionNumber || versionNumber} publicada.`;
          this.afterAction(reportId, 'publish', message, version.versionNumber || versionNumber);
        },
        error: (err: unknown) => {
          this.busyAction.set(null);
          this.handleActionError(
            reportId,
            'publish',
            err,
            `Falha ao publicar a versão ${versionNumber}.`,
          );
        },
      });
  }

  discardSelected(): void {
    const reportId = this.reportId();
    const summary = this.selectedSummary();
    if (!reportId || !summary || !this.actions().discard || this.busy()) return;
    const versionNumber = summary.versionNumber;
    const neverPublished = this.report()?.draft === true || !this.currentPublished();
    const consequence = neverPublished
      ? 'Este relatório nunca foi publicado: descartar o rascunho apaga o relatório.'
      : 'A versão publicada continua em uso.';
    const ok = confirm(`Descartar o rascunho v${versionNumber}?\n\n${consequence}`);
    if (!ok) return;

    this.busyAction.set('discard');
    this.feedback.set(null);
    this.reportService
      .discardReportVersion(reportId, versionNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.busyAction.set(null);
          if (res.reportDeleted) {
            const name = this.report()?.name || summary.name;
            const message =
              `Rascunho v${versionNumber} descartado. ` +
              `O relatório "${name}" nunca tinha sido publicado e foi removido.`;
            this.resetState();
            this.changed.emit({ reportId, action: 'discard', reportDeleted: true, message });
            return;
          }
          const message = `Rascunho v${versionNumber} descartado.`;
          this.afterAction(
            reportId,
            'discard',
            message,
            this.currentPublished()?.versionNumber ?? null,
          );
        },
        error: (err: unknown) => {
          this.busyAction.set(null);
          this.handleActionError(
            reportId,
            'discard',
            err,
            `Falha ao descartar o rascunho v${versionNumber}.`,
          );
        },
      });
  }

  restoreSelected(): void {
    const reportId = this.reportId();
    const summary = this.selectedSummary();
    if (!reportId || !summary || !this.actions().restore || this.busy()) return;
    const versionNumber = summary.versionNumber;
    const published = this.currentPublished();
    const replaces = published ? `, substituindo a v${published.versionNumber}` : '';
    const ok = confirm(
      `Restaurar a versão ${versionNumber}?\n\n` +
        `Será criada uma nova versão publicada com o conteúdo da v${versionNumber}${replaces}.`,
    );
    if (!ok) return;

    this.busyAction.set('restore');
    this.feedback.set(null);
    this.reportService
      .restoreReportVersion(reportId, versionNumber, this.note())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (version) => {
          this.busyAction.set(null);
          const message =
            `Versão ${versionNumber} restaurada como nova versão publicada ` +
            `(v${version.versionNumber}).`;
          this.afterAction(reportId, 'restore', message, version.versionNumber || null);
        },
        error: (err: unknown) => {
          this.busyAction.set(null);
          this.handleActionError(
            reportId,
            'restore',
            err,
            `Falha ao restaurar a versão ${versionNumber}.`,
          );
        },
      });
  }

  reuseSelected(): void {
    const reportId = this.reportId();
    const summary = this.selectedSummary();
    if (!reportId || !summary || !this.actions().reuse || this.busy()) return;
    const versionNumber = summary.versionNumber;
    const ok = confirm(
      `Usar a versão ${versionNumber} como rascunho?\n\n` +
        'O rascunho aberto, se houver, vira histórico. Nada é publicado.',
    );
    if (!ok) return;

    this.busyAction.set('reuse');
    this.feedback.set(null);
    this.reportService
      .reuseReportVersion(reportId, versionNumber, this.note())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (version) => {
          this.busyAction.set(null);
          const message =
            `Versão ${versionNumber} retomada como rascunho ` + `v${version.versionNumber}.`;
          this.afterAction(reportId, 'reuse', message, version.versionNumber || null);
        },
        error: (err: unknown) => {
          this.busyAction.set(null);
          this.handleActionError(
            reportId,
            'reuse',
            err,
            `Falha ao retomar a versão ${versionNumber} como rascunho.`,
          );
        },
      });
  }

  noteLabel(): string {
    if (this.actions().publish) return 'Nota da publicação (opcional)';
    if (this.actions().restore) return 'Nota da restauração (opcional)';
    return 'Nota do novo rascunho (opcional)';
  }

  private handleOpenState(isOpen: boolean, reportId: string | null): void {
    if (!isOpen || !reportId) return;
    if (reportId !== this.loadedReportId) {
      this.resetState();
      this.loadedReportId = reportId;
    }
    this.feedback.set(null);
    this.loadVersions();
  }

  private afterAction(
    reportId: string,
    action: ReportVersionAction,
    message: string,
    preferredNumber: number | null,
  ): void {
    this.note.set('');
    this.setFeedback('status-success', message);
    this.loadVersions(preferredNumber);
    this.changed.emit({ reportId, action, reportDeleted: false, message });
  }

  private handleActionError(
    reportId: string,
    action: ReportVersionAction,
    err: unknown,
    fallback: string,
  ): void {
    const status = Number((err as HttpErrorResponse | null)?.status ?? 0);
    if (status === 409) {
      this.setFeedback(
        'status-error',
        action === 'reuse'
          ? 'Esta versão já é o rascunho aberto, ou mudou de estado enquanto você olhava. ' +
              'A lista de versões foi recarregada.'
          : 'Esta versão não está mais no estado esperado (pode ter sido publicada, descartada, ' +
              'substituída por uma versão mais nova ou alterada por outra pessoa). ' +
              'A lista de versões foi recarregada.',
      );
      this.loadVersions();
      this.changed.emit({ reportId, action, reportDeleted: false, message: '' });
      return;
    }
    this.setFeedback('status-error', this.describeError(err, fallback));
  }

  private describeError(err: unknown, fallback: string): string {
    const status = Number((err as HttpErrorResponse | null)?.status ?? 0);
    if (status === 403) return 'Você não tem permissão para esta ação nas versões deste relatório.';
    // So mensagem do backend; sem ela, o texto da tela (nao o "Http failure response..." do Angular).
    return resolveAiErrorMessage(err, fallback);
  }

  private setFeedback(tone: StatusTone, message: string): void {
    this.feedback.set({ tone, message });
  }

  private buildPreviewParams(version: ReportVersion): Record<string, unknown> | null {
    const result = buildRunParams(sortVersionVariables(version.variables), this.paramInputs());
    if (result.error) {
      this.setFeedback(
        'status-error',
        `${result.error.replace(/\.$/, '')}. Ajuste o valor no formulário de parâmetros da ` +
          'página (feche este painel) ou defina um valor padrão na versão.',
      );
      return null;
    }
    return result.params ?? {};
  }

  private ensurePublishedLoaded(): void {
    const published = this.currentPublished();
    if (published) this.ensureVersionLoaded(published.versionNumber);
  }

  private ensureVersionLoaded(versionNumber: number): void {
    const reportId = this.reportId();
    if (!reportId || this.versionCache()[versionNumber]) return;
    const generation = this.cacheGeneration;
    const loadKey = `${generation}:${reportId}:${versionNumber}`;
    if (this.pendingVersionLoads.has(loadKey)) return;
    this.pendingVersionLoads.add(loadKey);
    this.reportService
      .getReportVersion(reportId, versionNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (version) => {
          this.pendingVersionLoads.delete(loadKey);
          if (generation !== this.cacheGeneration || reportId !== this.reportId()) return;
          this.versionCache.update((cache) => ({ ...cache, [versionNumber]: version }));
          if (this.currentPublished()?.versionNumber === versionNumber) this.compareError.set('');
        },
        error: (err: unknown) => {
          this.pendingVersionLoads.delete(loadKey);
          if (generation !== this.cacheGeneration || reportId !== this.reportId()) return;
          // A publicada carregada so para comparar tem erro proprio, para a comparacao nao ficar
          // em "carregando"; erro de outra versao qualquer nao aparece sobre a que esta na tela.
          if (this.selectedNumber() !== versionNumber) {
            if (this.currentPublished()?.versionNumber === versionNumber) {
              this.compareError.set(
                this.describeError(
                  err,
                  `Falha ao carregar a versão publicada ${versionNumber} para comparar.`,
                ),
              );
            }
            return;
          }
          this.versionError.set(
            this.describeError(err, `Falha ao carregar o conteúdo da versão ${versionNumber}.`),
          );
        },
      });
  }

  private invalidateLoadedContent(): void {
    this.cacheGeneration++;
    this.pendingVersionLoads.clear();
    this.versionCache.set({});
    this.compareError.set('');
    this.clearPreview();
  }

  private clearPreview(): void {
    this.previewSeq++;
    this.loadingPreview.set(false);
    this.preview.set(null);
    this.previewVersionNumber.set(null);
  }

  private resetState(): void {
    this.listLoadSeq++;
    this.loadedReportId = null;
    this.versions.set([]);
    this.invalidateLoadedContent();
    this.selectedNumber.set(null);
    this.versionError.set('');
    this.listError.set('');
    this.loadingList.set(false);
    this.viewMode.set('content');
    this.compareTarget.set('sql');
    this.note.set('');
    this.feedback.set(null);
  }
}
