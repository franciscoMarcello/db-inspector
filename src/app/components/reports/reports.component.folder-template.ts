import { HttpErrorResponse } from '@angular/common/http';
import { JasperTemplateResponse, ReportFolder, ReportService } from '../../services/report.service';
import { createEmptyTemplateDraft } from './reports.component.constants';
import { FolderNode, ReportDraft, TemplateDraft } from './reports.component.models';
import { toTemplatePayload, validateTemplateDraft } from './reports.component.utils';

export interface ReportsFolderTemplateHost {
  folders: FolderNode[];
  allFolders: ReportFolder[];
  templates: JasperTemplateResponse[];
  selectedFolderId: string | null;
  selectedTemplateId: string | null;
  selectedFolder: FolderNode | null;
  statusMessage: string;
  newFolderName: string;
  renameFolderName: string;
  reportDraft: ReportDraft;
  reportDraftError: string;
  folderManagerOpen: boolean;
  templateManagerOpen: boolean;
  templateDraft: TemplateDraft;
  templateDraftError: string;
  templateDraftStatus: string;
  templateFileName: string;
  loadingTemplate: boolean;
  creatingTemplate: boolean;
  loadDataFromAdmin(preferredReportId?: string, preferredFolderId?: string): void;
  rebuildVisibleFolders(apiFolders: ReportFolder[]): void;
}

export class ReportsFolderTemplateLogic {
  constructor(
    private readonly host: ReportsFolderTemplateHost,
    private readonly reportService: ReportService
  ) {}

  openFolderManager() {
    this.host.folderManagerOpen = true;
    if (!this.host.selectedFolderId && this.host.folders.length) {
      this.host.selectedFolderId = this.host.folders[0].id;
    }
    this.host.renameFolderName = this.host.selectedFolder?.name ?? '';
  }

  closeFolderManager() {
    this.host.folderManagerOpen = false;
  }

  onFolderManagerSelectionChange(folderId: string) {
    const normalized = String(folderId || '').trim();
    this.host.selectedFolderId = normalized || null;
    this.host.renameFolderName = this.host.selectedFolder?.name ?? '';
  }

  createFolder() {
    const name = this.host.newFolderName.trim();
    if (!name) {
      this.host.statusMessage = 'Informe um nome para a pasta.';
      return;
    }
    if (!this.ensureFolderNameAvailable(name, false)) return;
    this.createFolderByName(name, false);
  }

  createFolderFromReportModal() {
    const name = (prompt('Nome da nova pasta:', '') || '').trim();
    if (!name) return;
    if (!this.ensureFolderNameAvailable(name, true)) return;
    this.createFolderByName(name, true);
  }

  renameSelectedFolder() {
    const folder = this.host.selectedFolder;
    if (!folder) {
      this.host.statusMessage = 'Selecione uma pasta para renomear.';
      return;
    }

    const name = this.host.renameFolderName.trim();
    if (!name) {
      this.host.statusMessage = 'Informe o novo nome da pasta.';
      return;
    }
    if (name === folder.name) return;

    this.reportService.updateFolder(folder.id, { name, description: folder.description }).subscribe({
      next: (updated) => {
        this.host.renameFolderName = updated.name;
        this.host.statusMessage = `Pasta renomeada para "${updated.name}".`;
        this.host.loadDataFromAdmin(undefined, updated.id);
      },
      error: () => {
        this.host.statusMessage = 'Falha ao renomear pasta.';
      },
    });
  }

  archiveSelectedFolder() {
    this.updateSelectedFolderArchived(true);
  }

  unarchiveSelectedFolder() {
    this.updateSelectedFolderArchived(false);
  }

  openTemplateManager() {
    this.host.templateManagerOpen = true;
    this.resetTemplateManagerState();
    this.refreshTemplates(this.host.reportDraft.jasperTemplateId || undefined);
  }

  closeTemplateManager() {
    this.host.templateManagerOpen = false;
    this.resetTemplateManagerState(false);
  }

  startNewTemplate() {
    this.host.selectedTemplateId = null;
    this.host.templateDraftError = '';
    this.host.templateDraftStatus = '';
    this.host.templateDraft = createEmptyTemplateDraft();
    this.host.templateFileName = '';
  }

  selectTemplate(templateId: string) {
    this.host.selectedTemplateId = templateId;
    this.host.templateDraftError = '';
    this.host.templateDraftStatus = '';
    this.host.loadingTemplate = true;
    this.reportService.getTemplate(templateId).subscribe({
      next: (template) => {
        this.host.loadingTemplate = false;
        this.host.templateDraft = {
          id: template.id,
          name: template.name,
          description: template.description || '',
          jrxml: template.jrxml,
        };
        this.host.templateFileName = '';
      },
      error: () => {
        this.host.loadingTemplate = false;
        this.host.templateDraftError = 'Falha ao carregar template.';
      },
    });
  }

  async onTemplateManagerFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const fileName = file.name || '';
    if (!fileName.toLowerCase().endsWith('.jrxml')) {
      this.host.templateDraftError = 'Selecione um arquivo .jrxml válido.';
      if (input) input.value = '';
      return;
    }

    try {
      const jrxml = (await file.text()).trim();
      if (!jrxml) {
        this.host.templateDraftError = 'Arquivo JRXML vazio.';
        return;
      }
      this.host.templateDraft.jrxml = jrxml;
      this.host.templateFileName = fileName;
      if (!this.host.templateDraft.name.trim()) {
        this.host.templateDraft.name = fileName.replace(/\.jrxml$/i, '').trim();
      }
    } catch {
      this.host.templateDraftError = 'Falha ao ler arquivo JRXML.';
    } finally {
      if (input) input.value = '';
    }
  }

  saveTemplateFromModal() {
    const templateValidation = validateTemplateDraft(this.host.templateDraft);
    if (templateValidation.error) {
      this.host.templateDraftError = templateValidation.error;
      return;
    }

    const payload = toTemplatePayload(this.host.templateDraft);
    this.host.creatingTemplate = true;
    this.host.templateDraftError = '';
    const onSuccess = (savedId: string, action: 'criado' | 'atualizado') => {
      this.host.creatingTemplate = false;
      this.host.reportDraft.jasperTemplateId = savedId;
      this.host.templateDraftStatus = `Template ${action} e vinculado ao relatório.`;
      this.refreshTemplates(savedId);
    };

    const onError = (action: 'criar' | 'atualizar') => {
      this.host.creatingTemplate = false;
      this.host.templateDraftError = `Falha ao ${action} template PDF.`;
    };

    if (this.host.templateDraft.id) {
      this.reportService.updateTemplate(this.host.templateDraft.id, payload).subscribe({
        next: (updated) => onSuccess(updated.id, 'atualizado'),
        error: () => onError('atualizar'),
      });
      return;
    }

    this.reportService.createTemplate(payload).subscribe({
      next: (created) => onSuccess(created.id, 'criado'),
      error: () => onError('criar'),
    });
  }

  deleteTemplateFromManager() {
    if (!this.host.templateDraft.id) {
      this.host.templateDraftError = 'Selecione um template para excluir.';
      return;
    }
    if (!confirm(`Excluir template "${this.host.templateDraft.name}"?`)) return;

    this.host.creatingTemplate = true;
    this.host.templateDraftError = '';
    this.host.templateDraftStatus = '';
    this.reportService.deleteTemplate(this.host.templateDraft.id).subscribe({
      next: () => {
        const deletedId = this.host.templateDraft.id;
        this.host.creatingTemplate = false;
        if (this.host.reportDraft.jasperTemplateId === deletedId) {
          this.host.reportDraft.jasperTemplateId = '';
        }
        this.startNewTemplate();
        this.host.templateDraftStatus = 'Template excluído.';
        this.refreshTemplates();
      },
      error: (err: HttpErrorResponse) => {
        this.host.creatingTemplate = false;
        if (err.status === 409) {
          this.host.templateDraftError = 'Não foi possível excluir: template vinculado a relatório.';
          return;
        }
        this.host.templateDraftError = 'Falha ao excluir template.';
      },
    });
  }

  applyTemplateToReport() {
    if (!this.host.templateDraft.id) {
      this.host.templateDraftError = 'Selecione um template para vincular.';
      return;
    }
    this.host.reportDraft.jasperTemplateId = this.host.templateDraft.id;
    this.host.templateDraftStatus = `Template "${this.host.templateDraft.name}" vinculado ao relatório.`;
  }

  private refreshTemplates(preferredId?: string) {
    this.reportService.listTemplates().subscribe({
      next: (templates) => {
        this.host.templates = (templates || [])
          .filter((t) => !t.archived)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const has = (id: string | null | undefined) => !!id && this.host.templates.some((t) => t.id === id);
        const nextId = has(preferredId) ? preferredId! : has(this.host.selectedTemplateId) ? this.host.selectedTemplateId! : null;
        if (nextId) this.selectTemplate(nextId);
        else this.host.selectedTemplateId = null;
      },
      error: () => {
        this.host.templateDraftError = 'Falha ao listar templates.';
      },
    });
  }

  private ensureFolderNameAvailable(name: string, fromModal: boolean): boolean {
    const lower = name.toLowerCase();
    if (this.host.folders.some((folder) => folder.name.toLowerCase() === lower)) {
      if (fromModal) this.host.reportDraftError = 'Ja existe uma pasta com esse nome.';
      else this.host.statusMessage = 'Ja existe uma pasta com esse nome.';
      return false;
    }
    if (this.host.allFolders.some((folder) => folder.archived && folder.name.toLowerCase() === lower)) {
      const msg = 'Ja existe uma pasta arquivada com esse nome. Desarquive-a para reutilizar.';
      if (fromModal) this.host.reportDraftError = msg;
      else this.host.statusMessage = msg;
      return false;
    }
    return true;
  }

  private createFolderByName(name: string, fromModal: boolean) {
    this.reportService.createFolder({ name, description: null }).subscribe({
      next: (folder) => {
        this.host.statusMessage = `Pasta "${folder.name}" criada.`;
        if (fromModal) {
          this.host.allFolders = [...this.host.allFolders, folder];
          this.host.rebuildVisibleFolders(this.host.allFolders.filter((f) => !f.archived));
          this.host.selectedFolderId = folder.id;
          this.host.reportDraft.folderId = folder.id;
          this.host.reportDraftError = '';
          return;
        }
        this.host.newFolderName = '';
        this.host.renameFolderName = folder.name;
        this.host.loadDataFromAdmin(undefined, folder.id);
      },
      error: (err: HttpErrorResponse) => {
        const msg =
          err.status === 409
            ? 'Nao foi possivel criar: ja existe uma pasta com esse nome (ativa ou arquivada).'
            : 'Falha ao criar pasta.';
        if (fromModal) this.host.reportDraftError = msg;
        else this.host.statusMessage = msg;
      },
    });
  }

  private resetTemplateManagerState(resetDraft = true) {
    this.host.templateDraftError = '';
    this.host.templateDraftStatus = '';
    this.host.creatingTemplate = false;
    this.host.loadingTemplate = false;
    if (resetDraft) this.startNewTemplate();
  }

  private updateSelectedFolderArchived(archived: boolean) {
    const folder = this.host.selectedFolder;
    if (!folder) {
      this.host.statusMessage = `Selecione uma pasta para ${archived ? 'arquivar' : 'desarquivar'}.`;
      return;
    }
    this.reportService.updateFolder(folder.id, {
      name: folder.name,
      description: folder.description,
      archived,
    }).subscribe({
      next: () => {
        this.host.statusMessage = `Pasta "${folder.name}" ${archived ? 'arquivada' : 'desarquivada'}.`;
        this.host.loadDataFromAdmin(undefined, archived ? undefined : folder.id);
      },
      error: () => {
        this.host.statusMessage = `Falha ao ${archived ? 'arquivar' : 'desarquivar'} pasta.`;
      },
    });
  }
}
