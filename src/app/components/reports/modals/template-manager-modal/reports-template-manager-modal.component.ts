import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JasperTemplateResponse } from '../../../../services/report.service';
import { TemplateDraft } from '../../core/reports.component.models';

@Component({
  selector: 'app-reports-template-manager-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-template-manager-modal.component.html',
  styleUrls: [
    '../../reports-page/reports.component.css',
    '../../reports-page/reports.component.table.css',
    '../../reports-page/reports.component.modals.css',
    '../../reports-page/reports.component.responsive.css',
  ],
})
export class ReportsTemplateManagerModalComponent {
  @Input() open = false;
  @Input() templates: JasperTemplateResponse[] = [];
  @Input() selectedTemplateId: string | null = null;
  @Input() templateDraft!: TemplateDraft;
  @Input() templateFileName = '';
  @Input() loadingTemplate = false;
  @Input() templateDraftError = '';
  @Input() templateDraftStatus = '';
  @Input() creatingTemplate = false;

  @Output() close = new EventEmitter<void>();
  @Output() startNew = new EventEmitter<void>();
  @Output() selectTemplate = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() deleteTemplate = new EventEmitter<void>();
  @Output() applyTemplate = new EventEmitter<void>();
  @Output() saveTemplate = new EventEmitter<void>();
}
