import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReportService } from '../../../../services/report.service';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';
import { resolveAiErrorMessage } from '../../core/reports.component.ai-utils';

@Component({
  selector: 'app-reports-ai-manual-modal',
  standalone: true,
  imports: [AppButtonComponent],
  templateUrl: './reports-ai-manual-modal.component.html',
  styleUrls: ['../../reports-page/reports.component.modals.css'],
})
export class ReportsAiManualModalComponent {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly close = output<void>();
  readonly openTokens = output<void>();

  readonly instructions = signal<string | null>(null);
  readonly loadingInstructions = signal(false);
  readonly instructionsError = signal('');

  onInstructionsToggle(event: Event): void {
    const details = event.target as HTMLDetailsElement | null;
    if (details?.open) this.loadInstructions();
  }

  loadInstructions(force = false): void {
    if (this.loadingInstructions()) return;
    if (!force && this.instructions() !== null) return;
    this.loadingInstructions.set(true);
    this.instructionsError.set('');
    this.reportService
      .getAiInstructions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (text) => {
          this.loadingInstructions.set(false);
          this.instructions.set(text ?? '');
        },
        error: (err: unknown) => {
          this.loadingInstructions.set(false);
          this.instructionsError.set(
            resolveAiErrorMessage(err, 'Falha ao carregar as instruções que a IA recebe.'),
          );
        },
      });
  }
}
