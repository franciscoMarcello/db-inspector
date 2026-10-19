import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Observable, catchError, exhaustMap, filter, fromEvent, merge, of, tap, timer } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { ReportService } from '../../../../services/report.service';
import { downloadBlobFile, resolveAiErrorMessage } from '../../core/reports.component.ai-utils';
import { ReportsAiApprovalsModalComponent } from '../../modals/ai-approvals-modal/reports-ai-approvals-modal.component';
import { ReportsAiManualModalComponent } from '../../modals/ai-manual-modal/reports-ai-manual-modal.component';
import { ReportsAiTokensModalComponent } from '../../modals/ai-tokens-modal/reports-ai-tokens-modal.component';

export const AI_PENDING_POLL_MS = 60_000;
export const AI_PACKAGE_FILE_NAME = 'dbinspector-ia.zip';

export type AiToolbarStatus = { message: string; autoClearMs?: number };

@Component({
  selector: 'app-reports-ai-toolbar',
  standalone: true,
  imports: [
    MatIconModule,
    MatMenuModule,
    ReportsAiManualModalComponent,
    ReportsAiTokensModalComponent,
    ReportsAiApprovalsModalComponent,
  ],
  templateUrl: './reports-ai-toolbar.component.html',
  host: { class: 'min-w-0' },
})
export class ReportsAiToolbarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly statusMessage = output<AiToolbarStatus>();

  readonly isAdmin = computed(() => this.auth.isAdmin());
  readonly pendingCount = signal(0);
  readonly downloadingPackage = signal(false);
  readonly manualOpen = signal(false);
  readonly tokensOpen = signal(false);
  readonly approvalsOpen = signal(false);

  ngOnInit(): void {
    if (this.isAdmin()) this.startPendingCountPolling();
  }

  isPageVisible(): boolean {
    return this.document.visibilityState === 'visible';
  }

  refreshPendingCount(): void {
    if (!this.isAdmin()) return;
    this.fetchPendingCount().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  openApprovals(): void {
    this.approvalsOpen.set(true);
  }

  closeApprovals(): void {
    this.approvalsOpen.set(false);
    this.refreshPendingCount();
  }

  openTokensFromManual(): void {
    this.manualOpen.set(false);
    this.tokensOpen.set(true);
  }

  downloadPackage(): void {
    if (this.downloadingPackage()) return;
    this.downloadingPackage.set(true);
    this.reportService
      .downloadAiPackage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPackage.set(false);
          downloadBlobFile(blob, AI_PACKAGE_FILE_NAME, this.document);
          this.statusMessage.emit({
            message: `Instruções para IA baixadas (${AI_PACKAGE_FILE_NAME}).`,
            autoClearMs: 3000,
          });
        },
        error: (err: unknown) => {
          this.downloadingPackage.set(false);
          const detail = resolveAiErrorMessage(err, '');
          this.statusMessage.emit({
            message: detail
              ? `Falha ao baixar as instruções para IA: ${detail}`
              : 'Falha ao baixar as instruções para IA.',
          });
        },
      });
  }

  private fetchPendingCount(): Observable<number | null> {
    return this.reportService.getAiApprovalsPendingCount().pipe(
      tap((count) => this.pendingCount.set(count)),
      catchError(() => of(null)),
    );
  }

  private startPendingCountPolling(): void {
    merge(timer(0, AI_PENDING_POLL_MS), fromEvent(this.document, 'visibilitychange'))
      .pipe(
        filter(() => this.isPageVisible()),
        exhaustMap(() => this.fetchPendingCount()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
