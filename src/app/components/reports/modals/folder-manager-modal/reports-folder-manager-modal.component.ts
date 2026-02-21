import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FolderNode } from '../../core/reports.component.models';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';

@Component({
  selector: 'app-reports-folder-manager-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './reports-folder-manager-modal.component.html',
  styleUrls: [
    './reports-folder-manager-modal.component.css',
    '../../reports-page/reports.component.css',
    '../../reports-page/reports.component.table.css',
    '../../reports-page/reports.component.modals.css',
    '../../reports-page/reports.component.responsive.css',
  ],
})
export class ReportsFolderManagerModalComponent {
  @Input() open = false;
  @Input() folders: FolderNode[] = [];
  @Input() selectedFolderId: string | null = null;
  @Input() selectedFolder: FolderNode | null = null;
  @Input() newFolderName = '';
  @Input() renameFolderName = '';

  @Output() close = new EventEmitter<void>();
  @Output() selectedFolderIdChange = new EventEmitter<string>();
  @Output() newFolderNameChange = new EventEmitter<string>();
  @Output() renameFolderNameChange = new EventEmitter<string>();
  @Output() createFolder = new EventEmitter<void>();
  @Output() renameSelectedFolder = new EventEmitter<void>();
  @Output() archiveSelectedFolder = new EventEmitter<void>();
  @Output() unarchiveSelectedFolder = new EventEmitter<void>();

  renaming = false;

  startRename() {
    if (!this.selectedFolder) return;
    this.renaming = true;
  }

  cancelRename() {
    this.renaming = false;
  }

  confirmRename() {
    if (!this.selectedFolder) return;
    this.renameSelectedFolder.emit();
    this.renaming = false;
  }

  get selectedFolderStatusLabel(): string {
    if (!this.selectedFolder) return 'N/A';
    return this.selectedFolder.archived ? 'Arquivada' : 'Ativa';
  }

  get selectedFolderCreatedAtLabel(): string {
    const createdAt = this.selectedFolder?.createdAt;
    if (!createdAt || createdAt <= 0) return 'N/A';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(createdAt));
    } catch {
      return 'N/A';
    }
  }

  onArchiveClick() {
    if (!this.selectedFolder || this.selectedFolder.archived) return;
    const ok = confirm(
      `Arquivar pasta "${this.selectedFolder.name}"?\n\n` +
        'Pastas arquivadas não aparecem na listagem principal.'
    );
    if (ok) this.archiveSelectedFolder.emit();
  }
}
