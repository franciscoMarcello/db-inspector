import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JasperTemplateResponse } from '../../../../services/report.service';
import { TemplateDraft } from '../../core/reports.component.models';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';

@Component({
  selector: 'app-reports-template-manager-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './reports-template-manager-modal.component.html',
  styleUrls: [
    './reports-template-manager-modal.component.css',
    '../../reports-page/reports.component.css',
    '../../reports-page/reports.component.table.css',
    '../../reports-page/reports.component.modals.css',
    '../../reports-page/reports.component.responsive.css',
  ],
})
export class ReportsTemplateManagerModalComponent implements OnChanges {
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
  @Output() saveTemplate = new EventEmitter<void>();
  editorOpen = false;
  inputMode: 'upload' | 'manual' = 'upload';

  openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.editorOpen = !!this.templateDraft?.id;
      this.inputMode = this.templateFileName ? 'upload' : 'manual';
    }
    if (changes['selectedTemplateId'] && this.selectedTemplateId) {
      this.editorOpen = true;
    }
  }

  startCreateTemplate() {
    this.startNew.emit();
    this.editorOpen = true;
    this.inputMode = 'upload';
  }

  openTemplateEditor(templateId: string) {
    this.selectTemplate.emit(templateId);
    this.editorOpen = true;
    this.inputMode = 'upload';
  }

  closeEditorOnly() {
    this.editorOpen = false;
  }

  onInputModeChange(mode: 'upload' | 'manual') {
    this.inputMode = mode;
  }

  get hasTemplates(): boolean {
    return this.templates.length > 0;
  }

  get isEditingTemplate(): boolean {
    return !!this.templateDraft?.id;
  }

  get saveButtonLabel(): string {
    if (this.creatingTemplate) return 'Salvando...';
    return this.isEditingTemplate ? 'Salvar alterações' : 'Criar template';
  }

  get hasJrxmlContent(): boolean {
    return !!this.templateDraft?.jrxml?.trim();
  }

  get detectedParameterCount(): number {
    const jrxml = String(this.templateDraft?.jrxml ?? '');
    const matches = jrxml.match(/\$P\{([^}]+)\}/g) || [];
    const uniq = new Set(matches.map((m) => m.replace(/^\$P\{|\}$/g, '').trim()).filter(Boolean));
    return uniq.size;
  }

  get jrxmlSizeLabel(): string {
    const text = String(this.templateDraft?.jrxml ?? '');
    const bytes = new TextEncoder().encode(text).length;
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
}
