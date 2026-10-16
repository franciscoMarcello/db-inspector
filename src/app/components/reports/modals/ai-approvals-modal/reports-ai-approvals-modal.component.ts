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
import { Observable } from 'rxjs';
import {
  AiApproval,
  AiApprovalDecision,
  AiApprovalStatus,
  ReportService,
} from '../../../../services/report.service';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';
import {
  AI_PILL_ACTIVE_CLASS,
  AI_PILL_INACTIVE_CLASS,
  aiToneTextClass,
  formatDateTimeMs,
  resolveAiErrorMessage,
} from '../../core/reports.component.ai-utils';
import { StatusTone, statusTitleFromTone } from '../../core/reports.component.utils';

export const AI_APPROVAL_MAX_ROWS = 5000;
export const AI_APPROVAL_DEFAULT_MINUTES = 60;
export const AI_APPROVAL_MAX_MINUTES = 1440;
export const AI_APPROVAL_NOTE_MAX = 2000;

export type AiApprovalFilter = AiApprovalStatus | 'ALL';
export type AiApprovalDecisionKind = 'approve' | 'deny';

type Feedback = { tone: StatusTone; message: string };

const STATUS_LABELS: Record<AiApprovalStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  DENIED: 'Negado',
};

export function approvalStatusLabel(item: Pick<AiApproval, 'status' | 'vigente'>): string {
  if (item.status === 'APPROVED')
    return item.vigente ? 'Aprovado (vigente)' : 'Aprovado (expirado)';
  return STATUS_LABELS[item.status] ?? item.status;
}

export function defaultApprovalRows(requested: number): number {
  const value = Math.trunc(Number(requested) || 0);
  return Math.min(Math.max(value, 1), AI_APPROVAL_MAX_ROWS);
}

function readInteger(raw: unknown): number {
  const text = String(raw ?? '').trim();
  return text === '' ? Number.NaN : Number(text);
}

export function buildApprovalDecision(
  rowsRaw: unknown,
  minutesRaw: unknown,
  noteRaw: string,
): { decision?: AiApprovalDecision; error?: string } {
  const linhas = readInteger(rowsRaw);
  if (!Number.isInteger(linhas) || linhas < 1 || linhas > AI_APPROVAL_MAX_ROWS) {
    return { error: `Linhas: informe um número inteiro entre 1 e ${AI_APPROVAL_MAX_ROWS}.` };
  }
  const minutos = readInteger(minutesRaw);
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > AI_APPROVAL_MAX_MINUTES) {
    return {
      error: `Validade: informe um número inteiro de minutos entre 1 e ${AI_APPROVAL_MAX_MINUTES}.`,
    };
  }
  const nota = String(noteRaw ?? '').trim();
  if (nota.length > AI_APPROVAL_NOTE_MAX) {
    return { error: `A nota pode ter no máximo ${AI_APPROVAL_NOTE_MAX} caracteres.` };
  }
  return { decision: { linhas, minutos, ...(nota ? { nota } : {}) } };
}

export function sortApprovals(items: AiApproval[]): AiApproval[] {
  return [...items].sort((a, b) => {
    const pendingA = a.status === 'PENDING' ? 0 : 1;
    const pendingB = b.status === 'PENDING' ? 0 : 1;
    if (pendingA !== pendingB) return pendingA - pendingB;
    return (b.criadoEm || 0) - (a.criadoEm || 0);
  });
}

@Component({
  selector: 'app-reports-ai-approvals-modal',
  standalone: true,
  imports: [NgClass, FormsModule, AppButtonComponent],
  templateUrl: './reports-ai-approvals-modal.component.html',
  styleUrls: ['../../reports-page/reports.component.modals.css'],
})
export class ReportsAiApprovalsModalComponent {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly close = output<void>();
  readonly changed = output<void>();

  readonly statusFilter = signal<AiApprovalFilter>('PENDING');
  readonly approvals = signal<AiApproval[]>([]);
  readonly loading = signal(false);
  readonly listError = signal('');
  readonly feedback = signal<Feedback | null>(null);
  readonly decision = signal<{ id: string; kind: AiApprovalDecisionKind } | null>(null);
  readonly rows = signal<number | string | null>(null);
  readonly minutes = signal<number | string | null>(AI_APPROVAL_DEFAULT_MINUTES);
  readonly note = signal('');
  readonly decisionError = signal('');
  readonly submitting = signal(false);

  readonly filters: ReadonlyArray<{ value: AiApprovalFilter; label: string }> = [
    { value: 'PENDING', label: 'Pendentes' },
    { value: 'APPROVED', label: 'Aprovados' },
    { value: 'DENIED', label: 'Negados' },
    { value: 'ALL', label: 'Todos (últimos 100)' },
  ];
  readonly maxRows = AI_APPROVAL_MAX_ROWS;
  readonly maxMinutes = AI_APPROVAL_MAX_MINUTES;
  readonly noteMax = AI_APPROVAL_NOTE_MAX;
  readonly pillActiveClass = AI_PILL_ACTIVE_CLASS;
  readonly pillInactiveClass = AI_PILL_INACTIVE_CLASS;

  readonly approvalRows = computed(() =>
    sortApprovals(this.approvals()).map((item) => ({
      ...item,
      statusLabel: approvalStatusLabel(item),
      createdLabel: formatDateTimeMs(item.criadoEm),
      decidedLabel: formatDateTimeMs(item.decididoEm),
      expiresLabel: formatDateTimeMs(item.expiraEm),
      costLabel:
        item.custoEstimado === null || item.custoEstimado === undefined
          ? '—'
          : Number(item.custoEstimado).toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
    })),
  );

  private loadSeq = 0;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      untracked(() => {
        if (!isOpen) return;
        this.feedback.set(null);
        this.cancelDecision();
        this.load();
      });
    });
  }

  statusTitle(tone: StatusTone): string {
    return statusTitleFromTone(tone);
  }

  toneTextClass(tone: StatusTone): string {
    return aiToneTextClass(tone);
  }

  setFilter(filter: AiApprovalFilter): void {
    if (this.statusFilter() === filter) return;
    this.statusFilter.set(filter);
    this.cancelDecision();
    this.load();
  }

  load(): void {
    const seq = ++this.loadSeq;
    const filter = this.statusFilter();
    this.loading.set(true);
    this.listError.set('');
    this.reportService
      .listAiApprovals(filter === 'ALL' ? null : filter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          if (seq !== this.loadSeq) return;
          this.loading.set(false);
          this.approvals.set(items ?? []);
        },
        error: (err: unknown) => {
          if (seq !== this.loadSeq) return;
          this.loading.set(false);
          this.approvals.set([]);
          this.listError.set(resolveAiErrorMessage(err, 'Falha ao carregar os pedidos da IA.'));
        },
      });
  }

  startDecision(item: AiApproval, kind: AiApprovalDecisionKind): void {
    if (item.status !== 'PENDING' || this.submitting()) return;
    this.decision.set({ id: item.id, kind });
    this.rows.set(defaultApprovalRows(item.linhasPedidas));
    this.minutes.set(AI_APPROVAL_DEFAULT_MINUTES);
    this.note.set('');
    this.decisionError.set('');
  }

  cancelDecision(): void {
    this.decision.set(null);
    this.decisionError.set('');
  }

  isDeciding(item: AiApproval, kind: AiApprovalDecisionKind): boolean {
    const current = this.decision();
    return current?.id === item.id && current.kind === kind;
  }

  confirmDecision(item: AiApproval): void {
    const current = this.decision();
    if (!current || current.id !== item.id || this.submitting()) return;

    if (current.kind === 'deny') {
      const nota = this.note().trim();
      if (nota.length > AI_APPROVAL_NOTE_MAX) {
        this.decisionError.set(`A nota pode ter no máximo ${AI_APPROVAL_NOTE_MAX} caracteres.`);
        return;
      }
      this.submit(this.reportService.denyAiApproval(item.id, nota), 'Pedido negado.');
      return;
    }

    const result = buildApprovalDecision(this.rows(), this.minutes(), this.note());
    if (!result.decision) {
      this.decisionError.set(result.error ?? '');
      return;
    }
    const { linhas, minutos } = result.decision;
    this.submit(
      this.reportService.approveAiApproval(item.id, result.decision),
      `Pedido aprovado: até ${linhas} linhas, válido por ${minutos} minutos.`,
    );
  }

  private submit(request: Observable<AiApproval>, successMessage: string): void {
    this.submitting.set(true);
    this.decisionError.set('');
    this.feedback.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.decision.set(null);
        this.feedback.set({ tone: 'status-success', message: successMessage });
        this.load();
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (Number((err as HttpErrorResponse | null)?.status ?? 0) === 409) {
          this.decision.set(null);
          this.feedback.set({
            tone: 'status-error',
            message:
              'Este pedido já foi decidido (por outra pessoa ou em outra aba). ' +
              'A lista foi recarregada.',
          });
          this.load();
          this.changed.emit();
          return;
        }
        this.decisionError.set(resolveAiErrorMessage(err, 'Falha ao registrar a decisão.'));
      },
    });
  }
}
