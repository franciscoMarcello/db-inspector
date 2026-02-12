import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  JasperTemplateResponse,
  ReportCreateInput,
  ReportDefinition,
  ReportFolder,
  ReportRunResponse,
  ReportService,
  ReportVariable,
  ReportVariableOption,
  ReportVariableInput,
} from '../../services/report.service';

type FolderNode = ReportFolder & {
  expanded: boolean;
};

type DraftVariable = ReportVariableInput & {
  enabled: boolean;
};

type ReportDraft = {
  id: string | null;
  name: string;
  sql: string;
  description: string;
  folderId: string;
  jasperTemplateId: string;
};

type TemplateDraft = {
  id: string | null;
  name: string;
  description: string;
  jrxml: string;
};

const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;
const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class ReportsComponent implements OnInit {
  folders: FolderNode[] = [];
  allFolders: ReportFolder[] = [];
  reports: ReportDefinition[] = [];
  templates: JasperTemplateResponse[] = [];
  runResult: ReportRunResponse | null = null;

  selectedFolderId: string | null = null;
  selectedReportId: string | null = null;
  newFolderName = '';
  statusMessage = '';
  paramsError = '';
  loadingList = false;
  loadingRun = false;
  loadingPdf = false;
  manageMode = false;
  sidebarCollapsed = false;
  variableInputs: Record<string, string> = {};
  variableOptions: Record<string, ReportVariableOption[]> = {};
  loadingVariableOptions: Record<string, boolean> = {};
  variableOptionSearchText: Record<string, string> = {};
  reportModalOpen = false;
  reportModalMode: 'create' | 'edit' = 'create';
  reportDraft: ReportDraft = {
    id: null,
    name: '',
    sql: '',
    description: '',
    folderId: '',
    jasperTemplateId: '',
  };
  reportDraftVariables: DraftVariable[] = [];
  reportDraftError = '';
  templateManagerOpen = false;
  selectedTemplateId: string | null = null;
  templateDraft: TemplateDraft = {
    id: null,
    name: '',
    description: '',
    jrxml: '',
  };
  templateDraftError = '';
  templateDraftStatus = '';
  templateFileName = '';
  loadingTemplate = false;
  creatingTemplate = false;
  private pendingCreateSql: string | null = null;
  private optionsReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private optionsParamsSignatureByKey: Record<string, string> = {};

  constructor(
    private reportService: ReportService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.manageMode = this.route.snapshot.data['manage'] === true;
    this.pendingCreateSql = this.manageMode ? this.consumePendingSql() : null;
    this.loadData();
  }

  get selectedReport(): ReportDefinition | null {
    if (!this.selectedReportId) return null;
    return this.reports.find((report) => report.id === this.selectedReportId) ?? null;
  }

  get selectedFolder(): FolderNode | null {
    if (!this.selectedFolderId) return null;
    return this.folders.find((folder) => folder.id === this.selectedFolderId) ?? null;
  }

  get displayedRows(): Record<string, unknown>[] {
    const result = this.runResult;
    if (!result) return [];
    return result.rows;
  }

  get hasResultRows(): boolean {
    const result = this.runResult;
    if (!result) return false;
    const metaCount = Number(result.meta?.rowCount ?? 0);
    return metaCount > 0 && this.displayedRows.length > 0;
  }

  get canExportPdf(): boolean {
    return Boolean(this.selectedReport?.jasperTemplateId);
  }

  get hasRequiredParamsForRun(): boolean {
    const vars = this.selectedReportVariables;
    for (const v of vars) {
      if (!v.required) continue;
      const rawInput = (this.variableInputs[v.key] ?? '').trim();
      const fallback = (v.defaultValue ?? '').trim();
      if (!rawInput && !fallback) return false;
    }
    return true;
  }

  get selectedReportVariables() {
    return [...(this.selectedReport?.variables ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  get statusToneClass(): string {
    const msg = (this.statusMessage || '').toLowerCase();
    if (msg.includes('falha') || msg.includes('inválido') || msg.includes('invalido')) {
      return 'status-error';
    }
    if (
      msg.includes('criado') ||
      msg.includes('atualizado') ||
      msg.includes('removido') ||
      msg.includes('concluida') ||
      msg.includes('executada')
    ) {
      return 'status-success';
    }
    return 'status-info';
  }

  get statusTitle(): string {
    if (this.statusToneClass === 'status-error') return 'Erro';
    if (this.statusToneClass === 'status-success') return 'Sucesso';
    return 'Info';
  }

  reportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.reports.filter((report) => this.belongsToFolder(report, folder));
  }

  reportCountByFolder(folder: FolderNode): number {
    return this.reportsByFolder(folder).length;
  }

  toggleFolder(folderId: string) {
    this.folders = this.folders.map((folder) =>
      folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder
    );
  }

  selectFolder(folder: FolderNode) {
    this.selectedFolderId = folder.id;
    const first = this.reportsByFolder(folder)[0];
    this.selectedReportId = first?.id ?? null;
    this.runResult = null;
    this.statusMessage = '';
    this.optionsParamsSignatureByKey = {};
    if (this.selectedReportId) {
      this.initVariableInputs();
      this.reloadVariableOptions();
      this.runSelectedReport();
    }
  }

  selectReport(reportId: string) {
    this.selectedReportId = reportId;
    this.statusMessage = '';
    this.paramsError = '';
    this.optionsParamsSignatureByKey = {};
    this.initVariableInputs();
    this.reloadVariableOptions();
    this.runSelectedReport();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  goToManagement() {
    this.router.navigate(['/reports/manage']);
  }

  createFolder() {
    const name = this.newFolderName.trim();
    if (!name) {
      this.statusMessage = 'Informe um nome para a pasta.';
      return;
    }

    if (this.folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
      this.statusMessage = 'Ja existe uma pasta com esse nome.';
      return;
    }

    const archivedMatch = this.allFolders.find(
      (folder) => folder.archived && folder.name.toLowerCase() === name.toLowerCase()
    );
    if (archivedMatch) {
      this.statusMessage = 'Ja existe uma pasta arquivada com esse nome. Desarquive-a para reutilizar.';
      return;
    }

    this.reportService.createFolder({ name, description: null }).subscribe({
      next: (folder) => {
        this.statusMessage = `Pasta "${folder.name}" criada.`;
        this.newFolderName = '';
        this.loadData(undefined, folder.id);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.statusMessage =
            'Nao foi possivel criar: ja existe uma pasta com esse nome (ativa ou arquivada).';
          return;
        }
        this.statusMessage = 'Falha ao criar pasta.';
      },
    });
  }

  createFolderFromReportModal() {
    const name = (prompt('Nome da nova pasta:', '') || '').trim();
    if (!name) return;

    if (this.folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
      this.reportDraftError = 'Ja existe uma pasta com esse nome.';
      return;
    }

    const archivedMatch = this.allFolders.find(
      (folder) => folder.archived && folder.name.toLowerCase() === name.toLowerCase()
    );
    if (archivedMatch) {
      this.reportDraftError = 'Ja existe uma pasta arquivada com esse nome. Desarquive-a para reutilizar.';
      return;
    }

    this.reportService.createFolder({ name, description: null }).subscribe({
      next: (folder) => {
        this.allFolders = [...this.allFolders, folder];
        this.rebuildFolders(this.allFolders.filter((f) => !f.archived));
        this.selectedFolderId = folder.id;
        this.reportDraft.folderId = folder.id;
        this.reportDraftError = '';
        this.statusMessage = `Pasta "${folder.name}" criada.`;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.reportDraftError =
            'Nao foi possivel criar: ja existe uma pasta com esse nome (ativa ou arquivada).';
          return;
        }
        this.reportDraftError = 'Falha ao criar pasta.';
      },
    });
  }

  renameSelectedFolder() {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione uma pasta para renomear.';
      return;
    }

    const name = (prompt('Novo nome da pasta:', folder.name) || '').trim();
    if (!name || name === folder.name) return;

    this.reportService.updateFolder(folder.id, { name, description: folder.description }).subscribe({
      next: (updated) => {
        this.statusMessage = `Pasta renomeada para "${updated.name}".`;
        this.loadData(undefined, updated.id);
      },
      error: () => {
        this.statusMessage = 'Falha ao renomear pasta.';
      },
    });
  }

  deleteSelectedFolder() {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione uma pasta para excluir.';
      return;
    }
    if (!confirm(`Excluir pasta "${folder.name}"?`)) return;

    this.reportService.deleteFolder(folder.id).subscribe({
      next: () => {
        this.statusMessage = `Pasta "${folder.name}" removida.`;
        this.loadData();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.statusMessage = 'Nao foi possivel excluir: existe relatorio vinculado a esta pasta.';
          return;
        }
        this.statusMessage = 'Falha ao excluir pasta.';
      },
    });
  }

  archiveSelectedFolder() {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione uma pasta para arquivar.';
      return;
    }
    this.reportService
      .updateFolder(folder.id, {
        name: folder.name,
        description: folder.description,
        archived: true,
      })
      .subscribe({
        next: () => {
          this.statusMessage = `Pasta "${folder.name}" arquivada.`;
          this.loadData();
        },
        error: () => {
          this.statusMessage = 'Falha ao arquivar pasta.';
        },
      });
  }

  applyFilters() {
    this.statusMessage = 'Consulta executada.';
    this.runSelectedReport();
  }

  openCreateReportModal(presetSql?: string) {
    const folder = this.selectedFolder;
    if (!folder) {
      this.statusMessage = 'Selecione ou crie uma pasta antes de criar um relatorio.';
      return;
    }

    this.reportModalMode = 'create';
    this.reportModalOpen = true;
    this.reportDraftError = '';
    this.reportDraft = {
      id: null,
      name: '',
      sql: (presetSql || 'SELECT 1 AS ok;').trim(),
      description: '',
      folderId: folder.id,
      jasperTemplateId: '',
    };
    this.syncDraftVariablesFromSql();
  }

  openCreateReportForFolder(folder: FolderNode, event?: Event) {
    event?.stopPropagation();
    this.selectedFolderId = folder.id;
    this.openCreateReportModal(undefined);
  }

  openEditReportModal() {
    const current = this.selectedReport;
    const folder = this.selectedFolder;
    if (!current || !folder) return;

    this.reportModalMode = 'edit';
    this.reportModalOpen = true;
    this.reportDraftError = '';
    this.reportDraft = {
      id: current.id,
      name: current.name,
      sql: current.sql,
      description: current.description || '',
      folderId: folder.id,
      jasperTemplateId: current.jasperTemplateId || '',
    };
    this.syncDraftVariablesFromSql(current.variables || []);
  }

  closeReportModal() {
    this.reportModalOpen = false;
    this.reportDraftError = '';
  }

  onDraftSqlChanged() {
    this.syncDraftVariablesFromSql(this.reportDraftVariables);
  }

  openTemplateManager() {
    this.templateManagerOpen = true;
    this.templateDraftError = '';
    this.templateDraftStatus = '';
    this.creatingTemplate = false;
    this.loadingTemplate = false;
    this.startNewTemplate();
    this.refreshTemplates(this.reportDraft.jasperTemplateId || undefined);
  }

  closeTemplateManager() {
    this.templateManagerOpen = false;
    this.templateDraftError = '';
    this.templateDraftStatus = '';
    this.creatingTemplate = false;
    this.loadingTemplate = false;
  }

  startNewTemplate() {
    this.selectedTemplateId = null;
    this.templateDraftError = '';
    this.templateDraftStatus = '';
    this.templateDraft = {
      id: null,
      name: '',
      description: '',
      jrxml: '',
    };
    this.templateFileName = '';
  }

  selectTemplate(templateId: string) {
    this.selectedTemplateId = templateId;
    this.templateDraftError = '';
    this.templateDraftStatus = '';
    this.loadingTemplate = true;
    this.reportService.getTemplate(templateId).subscribe({
      next: (template) => {
        this.loadingTemplate = false;
        this.templateDraft = {
          id: template.id,
          name: template.name,
          description: template.description || '',
          jrxml: template.jrxml,
        };
        this.templateFileName = '';
      },
      error: () => {
        this.loadingTemplate = false;
        this.templateDraftError = 'Falha ao carregar template.';
      },
    });
  }

  onTemplateManagerFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const fileName = file.name || '';
    if (!fileName.toLowerCase().endsWith('.jrxml')) {
      this.templateDraftError = 'Selecione um arquivo .jrxml válido.';
      if (input) input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const jrxml = String(reader.result || '').trim();
      if (!jrxml) {
        this.templateDraftError = 'Arquivo JRXML vazio.';
        if (input) input.value = '';
        return;
      }
      this.templateDraft.jrxml = jrxml;
      this.templateFileName = fileName;
      if (!this.templateDraft.name.trim()) {
        this.templateDraft.name = fileName.replace(/\.jrxml$/i, '').trim();
      }
      if (input) input.value = '';
    };

    reader.onerror = () => {
      this.templateDraftError = 'Falha ao ler arquivo JRXML.';
      if (input) input.value = '';
    };

    reader.readAsText(file, 'utf-8');
  }

  saveTemplateFromModal() {
    const name = this.templateDraft.name.trim();
    const description = this.templateDraft.description.trim();
    const jrxml = this.templateDraft.jrxml.trim();

    if (!name) {
      this.templateDraftError = 'Informe o nome do template.';
      return;
    }
    if (!jrxml) {
      this.templateDraftError = 'Informe ou carregue o conteúdo JRXML.';
      return;
    }

    this.creatingTemplate = true;
    this.templateDraftError = '';
    const onSuccess = (savedId: string, action: 'criado' | 'atualizado') => {
      this.creatingTemplate = false;
      this.reportDraft.jasperTemplateId = savedId;
      this.templateDraftStatus = `Template ${action} e vinculado ao relatório.`;
      this.refreshTemplates(savedId);
    };

    const onError = (action: 'criar' | 'atualizar') => {
      this.creatingTemplate = false;
      this.templateDraftError = `Falha ao ${action} template PDF.`;
    };

    if (this.templateDraft.id) {
      this.reportService
        .updateTemplate(this.templateDraft.id, {
          name,
          description: description || null,
          jrxml,
          archived: false,
        })
        .subscribe({
          next: (updated) => onSuccess(updated.id, 'atualizado'),
          error: () => onError('atualizar'),
        });
      return;
    }

    this.reportService
      .createTemplate({
        name,
        description: description || null,
        jrxml,
        archived: false,
      })
      .subscribe({
        next: (created) => onSuccess(created.id, 'criado'),
        error: () => onError('criar'),
      });
  }

  deleteTemplateFromManager() {
    if (!this.templateDraft.id) {
      this.templateDraftError = 'Selecione um template para excluir.';
      return;
    }
    if (!confirm(`Excluir template "${this.templateDraft.name}"?`)) return;

    this.creatingTemplate = true;
    this.templateDraftError = '';
    this.templateDraftStatus = '';
    this.reportService.deleteTemplate(this.templateDraft.id).subscribe({
      next: () => {
        const deletedId = this.templateDraft.id;
        this.creatingTemplate = false;
        if (this.reportDraft.jasperTemplateId === deletedId) {
          this.reportDraft.jasperTemplateId = '';
        }
        this.startNewTemplate();
        this.templateDraftStatus = 'Template excluído.';
        this.refreshTemplates();
      },
      error: (err: HttpErrorResponse) => {
        this.creatingTemplate = false;
        if (err.status === 409) {
          this.templateDraftError = 'Não foi possível excluir: template vinculado a relatório.';
          return;
        }
        this.templateDraftError = 'Falha ao excluir template.';
      },
    });
  }

  applyTemplateToReport() {
    if (!this.templateDraft.id) {
      this.templateDraftError = 'Selecione um template para vincular.';
      return;
    }
    this.reportDraft.jasperTemplateId = this.templateDraft.id;
    this.templateDraftStatus = `Template "${this.templateDraft.name}" vinculado ao relatório.`;
  }

  private refreshTemplates(preferredId?: string) {
    this.reportService.listTemplates().subscribe({
      next: (templates) => {
        this.templates = (templates || [])
          .filter((t) => !t.archived)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        const nextId =
          preferredId && this.templates.some((t) => t.id === preferredId)
            ? preferredId
            : this.selectedTemplateId && this.templates.some((t) => t.id === this.selectedTemplateId)
            ? this.selectedTemplateId
            : null;
        if (nextId) {
          this.selectTemplate(nextId);
        } else {
          this.selectedTemplateId = null;
        }
      },
      error: () => {
        this.templateDraftError = 'Falha ao listar templates.';
      },
    });
  }

  saveReportFromModal() {
    const folder = this.folders.find((item) => item.id === this.reportDraft.folderId);
    if (!folder) {
      this.reportDraftError = 'Selecione uma pasta válida.';
      return;
    }

    const name = this.reportDraft.name.trim();
    const sql = this.reportDraft.sql.trim();
    const description = this.reportDraft.description.trim();

    if (!name) {
      this.reportDraftError = 'Informe o nome do relatório.';
      return;
    }
    if (!sql) {
      this.reportDraftError = 'Informe a SQL do relatório.';
      return;
    }

    const enabledVars = this.reportDraftVariables.filter((v) => v.enabled);
    const variables: ReportVariableInput[] = enabledVars.map((v, idx) => ({
      id: v.id,
      key: v.key,
      label: (v.label || v.key).trim(),
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue ? String(v.defaultValue) : null,
      orderIndex: idx,
      optionsSql: v.optionsSql?.trim() ? String(v.optionsSql).trim() : null,
    }));

    const payload: ReportCreateInput = {
      name,
      folderId: folder.id,
      templateName: folder.name,
      jasperTemplateId: this.reportDraft.jasperTemplateId || undefined,
      sql,
      description: description || null,
      variables,
      archived: false,
    };

    if (this.reportModalMode === 'create') {
      this.reportService.createReport(payload).subscribe({
        next: (created) => {
          this.statusMessage = `Relatorio "${created.name}" criado.`;
          this.reportModalOpen = false;
          this.loadData(created.id, folder.id);
        },
        error: () => {
          this.reportDraftError = 'Falha ao criar relatorio.';
        },
      });
      return;
    }

    if (!this.reportDraft.id) {
      this.reportDraftError = 'Relatório inválido para atualização.';
      return;
    }

    this.reportService.updateReport(this.reportDraft.id, payload).subscribe({
      next: (updated) => {
        this.statusMessage = `Relatorio "${updated.name}" atualizado.`;
        this.reportModalOpen = false;
        const nextFolder = updated.folderId ?? this.selectedFolderId;
        this.loadData(updated.id, nextFolder ?? undefined);
      },
      error: () => {
        this.reportDraftError = 'Falha ao atualizar relatorio.';
      },
    });
  }

  deleteSelectedReport() {
    const current = this.selectedReport;
    if (!current) return;
    if (!confirm(`Excluir relatorio "${current.name}"?`)) return;

    this.reportService.deleteReport(current.id).subscribe({
      next: () => {
        this.statusMessage = `Relatorio "${current.name}" removido.`;
        this.loadData(undefined, this.selectedFolderId ?? undefined);
      },
      error: () => {
        this.statusMessage = 'Falha ao remover relatorio.';
      },
    });
  }

  archiveSelectedReport() {
    const current = this.selectedReport;
    if (!current) {
      this.statusMessage = 'Selecione um relatório para arquivar.';
      return;
    }
    const folder = this.selectedFolder;
    const folderId =
      current.folderId ??
      folder?.id ??
      this.folders.find((f) => f.name === current.folderName || f.name === current.templateName)?.id;

    if (!folderId) {
      this.statusMessage = 'Não foi possível identificar a pasta do relatório para arquivar.';
      return;
    }

    const payload: ReportCreateInput = {
      name: current.name,
      folderId,
      templateName: folder?.name ?? current.folderName ?? current.templateName,
      jasperTemplateId: current.jasperTemplateId ?? undefined,
      sql: current.sql,
      description: current.description,
      variables: (current.variables || []).map((v, idx) => ({
        id: v.id,
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required,
        defaultValue: v.defaultValue,
        orderIndex: Number.isFinite(v.orderIndex) ? v.orderIndex : idx,
        optionsSql: v.optionsSql?.trim() ? String(v.optionsSql).trim() : null,
      })),
      archived: true,
    };

    this.reportService.updateReport(current.id, payload).subscribe({
      next: () => {
        this.statusMessage = `Relatório "${current.name}" arquivado.`;
        this.loadData();
      },
      error: () => {
        this.statusMessage = 'Falha ao arquivar relatório.';
      },
    });
  }

  exportExcel() {
    const result = this.runResult;
    if (!result) return;
    const xls = this.toXlsHtml(result.columns, result.rows);
    const blob = new Blob(['\uFEFF', xls], { type: 'application/vnd.ms-excel;charset=utf-8' });
    this.downloadBlob(blob, `${this.fileName(result.name)}.xls`);
    this.statusMessage = `Exportacao Excel concluida para "${result.name}".`;
  }

  exportPdf() {
    const report = this.selectedReport;
    if (!report?.id) {
      this.statusMessage = 'Selecione um relatório para exportar PDF.';
      return;
    }
    if (!report.jasperTemplateId) {
      this.statusMessage = 'Este relatório não possui template Jasper vinculado.';
      return;
    }

    const params = this.buildRunParams();
    if (params === null) return;

    this.loadingPdf = true;
    this.reportService.generateReportPdf(report.id, params, true).subscribe({
      next: (blob) => {
        this.loadingPdf = false;
        this.downloadBlob(blob, `${this.fileName(report.name)}.pdf`);
        this.statusMessage = `Exportacao PDF concluida para "${report.name}".`;
      },
      error: () => {
        this.loadingPdf = false;
        this.statusMessage = 'Falha ao exportar PDF.';
      },
    });
  }

  private loadData(preferredReportId?: string, preferredFolderId?: string) {
    this.loadingList = true;
    forkJoin({
      folders: this.reportService.listFolders(),
      reports: this.reportService.listReports(),
      templates: this.reportService.listTemplates(),
    }).subscribe({
      next: ({ folders, reports, templates }) => {
        this.allFolders = folders || [];
        this.reports = (reports || []).filter((r) => !r.archived);
        this.templates = (templates || []).filter((t) => !t.archived);
        this.rebuildFolders((folders || []).filter((f) => !f.archived));
        this.reconcileSelection(preferredReportId, preferredFolderId);
        if (this.manageMode && this.pendingCreateSql) {
          const sql = this.pendingCreateSql;
          this.pendingCreateSql = null;
          this.openCreateReportModal(sql);
        }
        this.loadingList = false;
      },
      error: () => {
        this.reports = [];
        this.templates = [];
        this.folders = [];
        this.runResult = null;
        this.selectedFolderId = null;
        this.selectedReportId = null;
        this.loadingList = false;
        this.statusMessage = 'Falha ao carregar relatorios/pastas.';
      },
    });
  }

  private runSelectedReport() {
    if (!this.selectedReportId) {
      this.runResult = null;
      return;
    }

    const params = this.buildRunParams();
    if (params === null) {
      this.runResult = null;
      return;
    }

    this.loadingRun = true;
    this.reportService.runReportWithParams(this.selectedReportId, params).subscribe({
      next: (res) => {
        this.paramsError = '';
        this.runResult = res;
        this.loadingRun = false;
      },
      error: () => {
        this.runResult = null;
        this.loadingRun = false;
        this.statusMessage = 'Falha ao executar relatorio.';
      },
    });
  }

  private rebuildFolders(apiFolders: ReportFolder[]) {
    const expanded = new Map(this.folders.map((folder) => [folder.id, folder.expanded]));
    this.folders = (apiFolders || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((folder) => ({
        ...folder,
        expanded: expanded.get(folder.id) ?? true,
      }));

    if (this.selectedFolderId && !this.folders.some((folder) => folder.id === this.selectedFolderId)) {
      this.selectedFolderId = null;
    }
  }

  private reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    if (!this.reports.length || !this.folders.length) {
      this.selectedFolderId = this.folders[0]?.id ?? null;
      this.selectedReportId = null;
      this.runResult = null;
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
      return;
    }

    if (preferredFolderId) {
      this.selectedFolderId = preferredFolderId;
    } else if (!this.selectedFolderId) {
      this.selectedFolderId = this.folders[0]?.id ?? null;
    }

    const selectedFolder = this.selectedFolder;
    let report = preferredReportId
      ? this.reports.find((item) => item.id === preferredReportId)
      : this.selectedReportId
      ? this.reports.find((item) => item.id === this.selectedReportId)
      : undefined;

    if (!report && selectedFolder) {
      report = this.reports.find((item) => this.belongsToFolder(item, selectedFolder));
    }
    if (!report) report = this.reports[0];

    this.selectedReportId = report?.id ?? null;

    if (this.selectedReportId) {
      if (report?.folderId) {
        this.selectedFolderId = report.folderId;
      } else if (report?.folderName) {
        const folderByName = this.folders.find((folder) => folder.name === report.folderName);
        if (folderByName) this.selectedFolderId = folderByName.id;
      } else if (report?.templateName) {
        // Backward compatibility if API still returns templateName.
        const folderByTemplate = this.folders.find(
          (folder) => folder.name === report.templateName || folder.id === report.templateName
        );
        if (folderByTemplate) this.selectedFolderId = folderByTemplate.id;
      }
      this.initVariableInputs();
      this.reloadVariableOptions();
      this.runSelectedReport();
    } else {
      this.runResult = null;
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
    }
  }

  private variablesFromSql(sql: string, currentVars: ReportVariableInput[] = []): ReportVariableInput[] {
    const currentByKey = new Map(currentVars.map((v) => [v.key, v]));
    const seen = new Set<string>();
    const vars: ReportVariableInput[] = [];
    let match: RegExpExecArray | null;

    while ((match = SQL_VARIABLE_RE.exec(sql)) !== null) {
      const key = match[2];
      if (seen.has(key)) continue;
      seen.add(key);
      const current = currentByKey.get(key);
      vars.push({
        key,
        label: current?.label ?? key,
        type: current?.type ?? 'string',
        required: current?.required ?? false,
        defaultValue: current?.defaultValue ?? null,
        orderIndex: vars.length,
      });
    }

    return vars;
  }

  private toXlsHtml(columns: string[], rows: Record<string, unknown>[]): string {
    const esc = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const thead = `<tr>${columns.map((col) => `<th>${esc(col)}</th>`).join('')}</tr>`;
    const tbody = rows
      .map((row) => `<tr>${columns.map((col) => `<td>${esc(row[col])}</td>`).join('')}</tr>`)
      .join('');

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      table { border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; white-space: nowrap; }
      th { font-weight: 700; background: #f1f5f9; }
    </style>
  </head>
  <body>
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  </body>
</html>`;
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private fileName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private belongsToFolder(report: ReportDefinition, folder: FolderNode): boolean {
    if (report.folderId && String(report.folderId) === String(folder.id)) return true;
    if (report.folderName && String(report.folderName) === String(folder.name)) return true;
    if (report.templateName && String(report.templateName) === String(folder.name)) return true;
    if (report.templateName && String(report.templateName) === String(folder.id)) return true;
    return false;
  }

  private initVariableInputs() {
    const vars = this.selectedReportVariables;
    const next: Record<string, string> = {};
    const previous = this.variableInputs;
    for (const v of vars) {
      const existing = previous[v.key];
      if (existing !== undefined) {
        next[v.key] = existing;
        continue;
      }
      next[v.key] = v.defaultValue ?? '';
    }
    this.variableInputs = next;
  }

  onVariableInputChanged() {
    if (this.optionsReloadTimer) {
      clearTimeout(this.optionsReloadTimer);
    }
    this.optionsReloadTimer = setTimeout(() => this.reloadVariableOptions(), 250);
  }

  hasVariableOptions(variable: ReportVariable): boolean {
    return Boolean(variable.optionsSql && variable.optionsSql.trim());
  }

  variableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return this.variableOptions[variable.key] || [];
  }

  filteredVariableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    const all = this.variableOptionItems(variable);
    const term = (this.variableOptionSearchText[variable.key] || '').trim().toLowerCase();
    if (!term) return all;
    return all.filter((opt) => String(opt.descricao ?? '').toLowerCase().includes(term));
  }

  variableOptionsLoading(variable: ReportVariable): boolean {
    return Boolean(this.loadingVariableOptions[variable.key]);
  }

  onVariableOptionSearchChange(variable: ReportVariable, text: string) {
    const key = variable.key;
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: text,
    };

    const normalized = text.trim().toLowerCase();
    const exact = this.variableOptionItems(variable).find(
      (opt) => String(opt.descricao ?? '').trim().toLowerCase() === normalized
    );

    this.variableInputs[key] = exact ? String(exact.valor ?? '') : '';
    this.onVariableInputChanged();
  }

  onVariableOptionSelected(variable: ReportVariable, option: ReportVariableOption | null) {
    const key = variable.key;
    if (!option) {
      this.variableInputs[key] = '';
      this.variableOptionSearchText = {
        ...this.variableOptionSearchText,
        [key]: '',
      };
      this.onVariableInputChanged();
      return;
    }

    this.variableInputs[key] = String(option.valor ?? '');
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: String(option.descricao ?? ''),
    };
    this.onVariableInputChanged();
  }

  displayVariableOption(value: ReportVariableOption | string | null): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.descricao ?? '');
  }

  private reloadVariableOptions() {
    const reportId = this.selectedReport?.id;
    if (!reportId) {
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
      return;
    }

    const optionVars = this.selectedReportVariables.filter((v) => this.hasVariableOptions(v));
    if (!optionVars.length) {
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
      return;
    }

    for (const variable of optionVars) {
      const params = this.buildParamsForOptions(variable.key);
      const signature = JSON.stringify(params);
      if (this.optionsParamsSignatureByKey[variable.key] === signature) {
        continue;
      }
      this.loadingVariableOptions = {
        ...this.loadingVariableOptions,
        [variable.key]: true,
      };
      this.reportService.listVariableOptions(reportId, variable.key, params, 100).subscribe({
        next: (options) => {
          this.optionsParamsSignatureByKey = {
            ...this.optionsParamsSignatureByKey,
            [variable.key]: signature,
          };
          this.variableOptions = {
            ...this.variableOptions,
            [variable.key]: options,
          };
          this.syncOptionSearchText(variable.key, options);
          this.loadingVariableOptions = {
            ...this.loadingVariableOptions,
            [variable.key]: false,
          };
        },
        error: () => {
          this.optionsParamsSignatureByKey = {
            ...this.optionsParamsSignatureByKey,
            [variable.key]: signature,
          };
          this.variableOptions = {
            ...this.variableOptions,
            [variable.key]: [],
          };
          this.loadingVariableOptions = {
            ...this.loadingVariableOptions,
            [variable.key]: false,
          };
        },
      });
    }
  }

  private buildParamsForOptions(excludeKey: string): Record<string, unknown> {
    const vars = this.selectedReportVariables;
    const params: Record<string, unknown> = {};
    for (const v of vars) {
      if (v.key === excludeKey) continue;
      const raw = (this.variableInputs[v.key] ?? '').trim();
      if (!raw) continue;
      const converted = this.convertVariableValue(v.type, raw, v.key, false);
      if (converted !== undefined) {
        params[v.key] = converted;
      }
    }
    return params;
  }

  private syncOptionSearchText(key: string, options: ReportVariableOption[]) {
    const rawValue = String(this.variableInputs[key] ?? '').trim();
    if (!rawValue) {
      this.variableOptionSearchText = {
        ...this.variableOptionSearchText,
        [key]: '',
      };
      return;
    }
    const match = options.find((opt) => String(opt.valor ?? '') === rawValue);
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: match ? String(match.descricao ?? '') : rawValue,
    };
  }

  private buildRunParams(): Record<string, unknown> | null {
    const vars = this.selectedReportVariables;
    if (!vars.length) return {};

    const params: Record<string, unknown> = {};
    for (const v of vars) {
      const rawInput = (this.variableInputs[v.key] ?? '').trim();
      const raw = rawInput || (v.defaultValue ?? '');

      if (!raw) {
        if (v.required) {
          this.paramsError = `Parametro obrigatório sem valor: ${v.label || v.key}`;
          this.statusMessage = this.paramsError;
          return null;
        }
        continue;
      }

      const converted = this.convertVariableValue(v.type, raw, v.key);
      if (converted === undefined) return null;
      params[v.key] = converted;
    }

    this.paramsError = '';
    return params;
  }

  private convertVariableValue(
    type: ReportVariableInput['type'],
    raw: string,
    key: string,
    setErrors = true
  ): unknown | undefined {
    if (type === 'string') return raw;

    if (type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        if (setErrors) {
          this.paramsError = `Valor inválido para ${key}: esperado número.`;
          this.statusMessage = this.paramsError;
        }
        return undefined;
      }
      return n;
    }

    if (type === 'boolean') {
      const normalized = raw.toLowerCase();
      if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false;
      if (setErrors) {
        this.paramsError = `Valor inválido para ${key}: esperado booleano.`;
        this.statusMessage = this.paramsError;
      }
      return undefined;
    }

    if (type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        if (setErrors) {
          this.paramsError = `Valor inválido para ${key}: esperado yyyy-MM-dd.`;
          this.statusMessage = this.paramsError;
        }
        return undefined;
      }
      return raw;
    }

    if (type === 'datetime') {
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
      const fromLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
        ? new Date(`${raw}:00`)
        : new Date(raw);
      if (Number.isNaN(fromLocal.getTime())) {
        if (setErrors) {
          this.paramsError = `Valor inválido para ${key}: esperado datetime ISO.`;
          this.statusMessage = this.paramsError;
        }
        return undefined;
      }
      return this.formatDateTime(fromLocal);
    }

    return raw;
  }

  private formatDateTime(value: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
      value.getHours()
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  private syncDraftVariablesFromSql(existing: Array<Partial<DraftVariable>> = []) {
    const existingByKey = new Map(existing.map((v) => [String(v.key || ''), v]));
    const detected = this.variablesFromSql(this.reportDraft.sql, []);
    this.reportDraftVariables = detected.map((v, idx) => {
      const current = existingByKey.get(v.key);
      return {
        id: current?.id ? String(current.id) : undefined,
        key: v.key,
        label: String(current?.label ?? v.key),
        type: (current?.type as DraftVariable['type']) || 'string',
        required: Boolean(current?.required ?? false),
        defaultValue:
          current?.defaultValue === undefined || current?.defaultValue === null
            ? null
            : String(current.defaultValue),
        optionsSql:
          current?.optionsSql === undefined || current?.optionsSql === null
            ? null
            : String(current.optionsSql),
        orderIndex: idx,
        enabled: Boolean(current?.enabled ?? true),
      };
    });
  }

  private consumePendingSql(): string | null {
    try {
      const sql = (localStorage.getItem(REPORT_DRAFT_SQL_KEY) || '').trim();
      localStorage.removeItem(REPORT_DRAFT_SQL_KEY);
      return sql || null;
    } catch {
      return null;
    }
  }
}
