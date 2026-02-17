import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { DraftVariable, FolderNode, ReportDraft } from './reports.component.models';
import { JasperTemplateResponse } from '../../services/report.service';

@Component({
  selector: 'app-reports-report-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './reports-report-modal.component.html',
  styleUrls: [
    './reports.component.css',
    './reports.component.table.css',
    './reports.component.modals.css',
    './reports.component.responsive.css',
  ],
})
export class ReportsReportModalComponent {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() reportDraft!: ReportDraft;
  @Input() reportDraftVariables: DraftVariable[] = [];
  @Input() reportDraftError = '';
  @Input() folders: FolderNode[] = [];
  @Input() templates: JasperTemplateResponse[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() createFolder = new EventEmitter<void>();
  @Output() openTemplateManager = new EventEmitter<void>();
  @Output() sqlChanged = new EventEmitter<void>();
  @Output() variablesDrop = new EventEmitter<CdkDragDrop<DraftVariable[]>>();
  @Output() save = new EventEmitter<void>();
}
