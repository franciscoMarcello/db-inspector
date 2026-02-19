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
}
