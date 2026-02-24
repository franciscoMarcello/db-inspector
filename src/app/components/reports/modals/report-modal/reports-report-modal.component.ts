import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { DraftVariable, FolderNode, ReportDraft } from '../../core/reports.component.models';
import { JasperTemplateResponse, ReportValidationResponse } from '../../../../services/report.service';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';

@Component({
  selector: 'app-reports-report-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MatIconModule, AppButtonComponent],
  templateUrl: './reports-report-modal.component.html',
  styleUrls: [
    './reports-report-modal.component.css',
    '../../reports-page/reports.component.css',
    '../../reports-page/reports.component.table.css',
    '../../reports-page/reports.component.modals.css',
    '../../reports-page/reports.component.responsive.css',
  ],
})
export class ReportsReportModalComponent {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() reportDraft!: ReportDraft;
  @Input() reportDraftVariables: DraftVariable[] = [];
  @Input() reportDraftError = '';
  @Input() validationInputs: Record<string, string> = {};
  @Input() validating = false;
  @Input() validationResult: ReportValidationResponse | null = null;
  @Input() validationError = '';
  @Input() previewLoading = false;
  @Input() previewError = '';
  @Input() previewColumns: string[] = [];
  @Input() previewRows: Record<string, unknown>[] = [];
  @Input() folders: FolderNode[] = [];
  @Input() templates: JasperTemplateResponse[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() createFolder = new EventEmitter<void>();
  @Output() openTemplateManager = new EventEmitter<void>();
  @Output() sqlChanged = new EventEmitter<void>();
  @Output() variablesDrop = new EventEmitter<CdkDragDrop<DraftVariable[]>>();
  @Output() validationInputChange = new EventEmitter<{ key: string; value: string }>();
  @Output() executeTest = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() saveAndTest = new EventEmitter<void>();
  showTemplatePicker = false;

  get usePdfTemplate(): boolean {
    return Boolean(this.reportDraft?.jasperTemplateId);
  }

  get templatePickerVisible(): boolean {
    return this.usePdfTemplate || this.showTemplatePicker;
  }

  onUsePdfTemplateChange(checked: boolean) {
    this.showTemplatePicker = checked;
    if (!checked && this.reportDraft) {
      this.reportDraft.jasperTemplateId = '';
    }
  }
}
