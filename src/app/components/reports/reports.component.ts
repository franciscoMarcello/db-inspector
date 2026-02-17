import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  JasperTemplateResponse,
  ReportDefinition,
  ReportFolder,
  ReportRunResponse,
  ReportService,
  ReportVariable,
  ReportVariableOption,
} from '../../services/report.service';
import { createXlsxBlob } from '../../utils/xlsx-export';
import { DraftVariable, FolderNode, ReportDraft, TemplateDraft } from './reports.component.models';
import {
  createEmptyReportDraft,
  createEmptyTemplateDraft,
  REPORT_DRAFT_SQL_KEY,
  REPORTS_FOLDERS_EXPANDED_KEY,
  REPORTS_SIDEBAR_COLLAPSED_KEY,
} from './reports.component.constants';
import { ReportsFolderTemplateHost, ReportsFolderTemplateLogic } from './reports.component.folder-template';
import { ReportsFolderManagerModalComponent } from './reports-folder-manager-modal.component';
import { ReportsReportModalComponent } from './reports-report-modal.component';
import { ReportsTemplateManagerModalComponent } from './reports-template-manager-modal.component';
import {
  buildArchivePayload,
  buildClearedFilterState,
  buildParamsForOptions,
  buildRunParams,
  belongsToFolder,
  computeVariableInputs,
  createReportDraftForCreate,
  createReportDraftForEdit,
  detectDraftVariables,
  displayVariableOption,
  filterVariableOptionItems,
  normalizeFileName,
  rebuildFolderNodes,
  readBooleanRecord,
  readFlag,
  resolveStatusTone,
  resolveSelection,
  StatusTone,
  statusTitleFromTone,
  writeBooleanRecord,
  writeFlag,
  consumeStoredText,
  syncOptionSearchText,
  toReportCreatePayload,
  toReportVariablesPayload,
  validateReportDraft,
} from './reports.component.utils';

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
    ReportsReportModalComponent,
    ReportsFolderManagerModalComponent,
    ReportsTemplateManagerModalComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrls: [
    './reports.component.css',
    './reports.component.table.css',
    './reports.component.modals.css',
    './reports.component.responsive.css',
  ],
})
export class ReportsComponent implements OnInit, ReportsFolderTemplateHost {
  folders: FolderNode[] = [];
  allFolders: ReportFolder[] = [];
  reports: ReportDefinition[] = [];
  templates: JasperTemplateResponse[] = [];
  runResult: ReportRunResponse | null = null;

  selectedFolderId: string | null = null;
  selectedReportId: string | null = null;
  newFolderName = '';
  renameFolderName = '';
  treeFilter = '';
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
  reportDraft: ReportDraft = createEmptyReportDraft();
  reportDraftVariables: DraftVariable[] = [];
  reportDraftError = '';
  folderManagerOpen = false;
  templateManagerOpen = false;
  selectedTemplateId: string | null = null;
  templateDraft: TemplateDraft = createEmptyTemplateDraft();
  templateDraftError = '';
  templateDraftStatus = '';
  templateFileName = '';
  loadingTemplate = false;
  creatingTemplate = false;
  private persistedFolderExpandedState: Record<string, boolean> = {};
  private pendingCreateSql: string | null = null;
  private optionsReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private optionsParamsSignatureByKey: Record<string, string> = {};
  private readonly folderTemplateLogic: ReportsFolderTemplateLogic;

  constructor(
    private reportService: ReportService,
    private route: ActivatedRoute
  ) {
    this.folderTemplateLogic = new ReportsFolderTemplateLogic(this, reportService);
  }

  ngOnInit(): void {
    this.manageMode = this.route.snapshot.data['manage'] === true;
    this.loadPersistedUiState();
    this.pendingCreateSql = this.manageMode ? this.consumePendingSql() : null;
    this.loadData();
  }

  get selectedReport(): ReportDefinition | null {
    return this.selectedReportId
      ? this.reports.find((report) => report.id === this.selectedReportId) ?? null
      : null;
  }

  get selectedFolder(): FolderNode | null {
    return this.selectedFolderId
      ? this.folders.find((folder) => folder.id === this.selectedFolderId) ?? null
      : null;
  }

  get displayedRows(): Record<string, unknown>[] {
    return this.runResult?.rows ?? [];
  }

  get hasResultRows(): boolean {
    const metaCount = Number(this.runResult?.meta?.rowCount ?? 0);
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
    return resolveStatusTone(this.statusMessage);
  }

  get statusTitle(): string {
    return statusTitleFromTone(this.statusToneClass as StatusTone);
  }

  reportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.reports.filter((report) => belongsToFolder(report, folder));
  }

  get hasTreeFilter(): boolean {
    return this.treeFilter.trim().length > 0;
  }

  get allFilteredFoldersExpanded(): boolean {
    return this.filteredFolders.length > 0 && this.filteredFolders.every((folder) => folder.expanded);
  }

  get filteredFolders(): FolderNode[] {
    const term = this.treeFilter.trim().toLowerCase();
    if (!term) return this.folders;
    return this.folders.filter((folder) => {
      const folderMatch = folder.name.toLowerCase().includes(term);
      if (folderMatch) return true;
      return this.reportsByFolder(folder).some((report) => report.name.toLowerCase().includes(term));
    });
  }

  filteredReportsByFolder(folder: FolderNode): ReportDefinition[] {
    const term = this.treeFilter.trim().toLowerCase();
    const reports = this.reportsByFolder(folder);
    if (!term) return reports;
    const folderMatch = folder.name.toLowerCase().includes(term);
    if (folderMatch) return reports;
    return reports.filter((report) => report.name.toLowerCase().includes(term));
  }

  reportCountByFolder(folder: FolderNode): number { return this.reportsByFolder(folder).length; }

  toggleFolder(folderId: string) {
    this.folders = this.folders.map((folder) =>
      folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder
    );
    this.persistFolderExpandedState();
  }

  toggleAllFoldersExpanded() {
    const shouldExpand = !this.allFilteredFoldersExpanded;
    const targetIds = new Set(this.filteredFolders.map((folder) => folder.id));
    this.folders = this.folders.map((folder) =>
      targetIds.has(folder.id) ? { ...folder, expanded: shouldExpand } : folder
    );
    this.persistFolderExpandedState();
  }

  clearTreeFilter() { this.treeFilter = ''; }

  selectFolder(folder: FolderNode) {
    this.selectedFolderId = folder.id;
    this.renameFolderName = folder.name;
    const first = this.reportsByFolder(folder)[0];
    this.selectedReportId = first?.id ?? null;
    this.runResult = null;
    this.statusMessage = '';
    this.optionsParamsSignatureByKey = {};
    if (this.selectedReportId) {
      this.initVariableInputs();
      this.reloadVariableOptions();
      this.runResult = null;
    }
  }

  selectReport(reportId: string) {
    this.selectedReportId = reportId;
    this.statusMessage = '';
    this.paramsError = '';
    this.runResult = null;
    this.optionsParamsSignatureByKey = {};
    this.initVariableInputs();
    this.reloadVariableOptions();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.persistSidebarCollapsedState();
  }

  loadDataFromAdmin(preferredReportId?: string, preferredFolderId?: string) {
    this.loadData(preferredReportId, preferredFolderId);
  }

  rebuildVisibleFolders(apiFolders: ReportFolder[]) {
    this.rebuildFolders(apiFolders);
  }

  openFolderManager() { this.folderTemplateLogic.openFolderManager(); }

  closeFolderManager() { this.folderTemplateLogic.closeFolderManager(); }

  onFolderManagerSelectionChange(folderId: string) {
    this.folderTemplateLogic.onFolderManagerSelectionChange(folderId);
  }

  createFolder() { this.folderTemplateLogic.createFolder(); }

  createFolderFromReportModal() { this.folderTemplateLogic.createFolderFromReportModal(); }

  renameSelectedFolder() { this.folderTemplateLogic.renameSelectedFolder(); }

  archiveSelectedFolder() { this.folderTemplateLogic.archiveSelectedFolder(); }

  unarchiveSelectedFolder() { this.folderTemplateLogic.unarchiveSelectedFolder(); }

  applyFilters() {
    this.statusMessage = 'Consulta executada.';
    this.runSelectedReport();
  }

  clearAllFilters() {
    const next = buildClearedFilterState(this.selectedReportVariables, this.variableOptionSearchText);
    this.variableInputs = next.inputs;
    this.variableOptionSearchText = next.search;
    this.paramsError = '';
    this.statusMessage = 'Filtros limpos.';
    this.onVariableInputChanged();
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
    this.reportDraft = createReportDraftForCreate(folder.id, presetSql);
    this.syncDraftVariablesFromSql();
  }

  openCreateReportForFolder(folder: FolderNode, event?: Event) {
    event?.stopPropagation();
    this.selectedFolderId = folder.id;
    this.openCreateReportModal();
  }

  openEditReportModal() {
    const current = this.selectedReport;
    const folder = this.selectedFolder;
    if (!current || !folder) return;

    this.reportModalMode = 'edit';
    this.reportModalOpen = true;
    this.reportDraftError = '';
    this.reportDraft = createReportDraftForEdit(current, folder.id);
    this.syncDraftVariablesFromSql(current.variables || []);
  }

  closeReportModal() { this.reportModalOpen = false; this.reportDraftError = ''; }

  onDraftSqlChanged() { this.syncDraftVariablesFromSql(this.reportDraftVariables); }

  onDraftVariablesDrop(event: CdkDragDrop<DraftVariable[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.reportDraftVariables];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reportDraftVariables = next;
  }

  openTemplateManager() { this.folderTemplateLogic.openTemplateManager(); }

  closeTemplateManager() { this.folderTemplateLogic.closeTemplateManager(); }

  startNewTemplate() { this.folderTemplateLogic.startNewTemplate(); }

  selectTemplate(templateId: string) { this.folderTemplateLogic.selectTemplate(templateId); }

  async onTemplateManagerFileSelected(event: Event) {
    await this.folderTemplateLogic.onTemplateManagerFileSelected(event);
  }

  saveTemplateFromModal() { this.folderTemplateLogic.saveTemplateFromModal(); }

  deleteTemplateFromManager() { this.folderTemplateLogic.deleteTemplateFromManager(); }

  applyTemplateToReport() { this.folderTemplateLogic.applyTemplateToReport(); }

  saveReportFromModal() {
    const folder = this.folders.find((item) => item.id === this.reportDraft.folderId);
    const validation = validateReportDraft(this.reportDraft, Boolean(folder));
    if (validation.error) {
      this.reportDraftError = validation.error;
      return;
    }
    if (!folder) return;

    const variables = toReportVariablesPayload(this.reportDraftVariables);
    const payload = toReportCreatePayload(this.reportDraft, folder, variables);

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

  archiveSelectedReport() { this.updateSelectedReportArchived(true); }

  unarchiveSelectedReport() { this.updateSelectedReportArchived(false); }

  exportExcel() {
    const result = this.runResult;
    if (!result) return;
    const blob = createXlsxBlob(result.columns, result.rows || []);
    this.downloadBlob(blob, `${normalizeFileName(result.name)}.xlsx`);
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
        this.downloadBlob(blob, `${normalizeFileName(report.name)}.pdf`);
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
        this.reports = this.manageMode ? reports || [] : (reports || []).filter((r) => !r.archived);
        this.templates = (templates || []).filter((t) => !t.archived);
        this.rebuildFolders(
          this.manageMode ? folders || [] : (folders || []).filter((f) => !f.archived)
        );
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
    this.folders = rebuildFolderNodes(apiFolders || [], this.folders, this.persistedFolderExpandedState);

    if (this.selectedFolderId && !this.folders.some((folder) => folder.id === this.selectedFolderId)) {
      this.selectedFolderId = null;
    }

    this.persistFolderExpandedState();
  }

  private loadPersistedUiState() {
    this.sidebarCollapsed = readFlag(REPORTS_SIDEBAR_COLLAPSED_KEY);
    this.persistedFolderExpandedState = readBooleanRecord(REPORTS_FOLDERS_EXPANDED_KEY);
  }

  private persistSidebarCollapsedState() {
    writeFlag(REPORTS_SIDEBAR_COLLAPSED_KEY, this.sidebarCollapsed);
  }

  private persistFolderExpandedState() {
    const state: Record<string, boolean> = {};
    for (const folder of this.folders) {
      state[String(folder.id)] = !!folder.expanded;
    }
    this.persistedFolderExpandedState = state;
    writeBooleanRecord(REPORTS_FOLDERS_EXPANDED_KEY, state);
  }

  private reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    const next = resolveSelection(
      this.reports,
      this.folders,
      this.selectedFolderId,
      this.selectedReportId,
      preferredReportId,
      preferredFolderId
    );
    this.selectedFolderId = next.selectedFolderId;
    this.selectedReportId = next.selectedReportId;

    if (!this.selectedReportId) {
      this.runResult = null;
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
      return;
    }

    this.initVariableInputs();
    this.reloadVariableOptions();
    this.runResult = null;
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private initVariableInputs() {
    this.variableInputs = computeVariableInputs(this.selectedReportVariables, this.variableInputs);
  }

  onVariableInputChanged() {
    if (this.optionsReloadTimer) clearTimeout(this.optionsReloadTimer);
    this.optionsReloadTimer = setTimeout(() => this.reloadVariableOptions(), 250);
  }

  hasVariableOptions(variable: ReportVariable): boolean {
    return Boolean(variable.optionsSql && variable.optionsSql.trim());
  }

  variableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return this.variableOptions[variable.key] || [];
  }

  filteredVariableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return filterVariableOptionItems(
      this.variableOptionItems(variable),
      this.variableOptionSearchText[variable.key] || ''
    );
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
    this.setVariableOptionValue(key, String(option?.valor ?? ''), String(option?.descricao ?? ''));
  }

  clearVariableOption(variable: ReportVariable) {
    this.setVariableOptionValue(variable.key, '', '');
  }

  displayVariableOption(value: ReportVariableOption | string | null): string {
    return displayVariableOption(value);
  }

  private reloadVariableOptions() {
    const reportId = this.selectedReport?.id;
    if (!reportId) {
      this.resetVariableOptionsState();
      return;
    }

    const optionVars = this.selectedReportVariables.filter((v) => this.hasVariableOptions(v));
    if (!optionVars.length) {
      this.resetVariableOptionsState();
      return;
    }

    for (const variable of optionVars) {
      const params = buildParamsForOptions(
        this.selectedReportVariables,
        this.variableInputs,
        variable.key
      );
      const signature = JSON.stringify(params);
      if (this.optionsParamsSignatureByKey[variable.key] === signature) continue;
      this.loadingVariableOptions = {
        ...this.loadingVariableOptions,
        [variable.key]: true,
      };
      this.reportService.listVariableOptions(reportId, variable.key, params, 100).subscribe({
        next: (options) => {
          this.applyVariableOptionFetchResult(variable.key, signature, options);
        },
        error: () => {
          this.applyVariableOptionFetchResult(variable.key, signature, []);
        },
      });
    }
  }

  private buildRunParams(): Record<string, unknown> | null {
    const result = buildRunParams(this.selectedReportVariables, this.variableInputs);
    if (result.error) {
      this.paramsError = result.error;
      this.statusMessage = this.paramsError;
      return null;
    }
    this.paramsError = '';
    return result.params ?? {};
  }

  private syncDraftVariablesFromSql(existing: Array<Partial<DraftVariable>> = []) {
    this.reportDraftVariables = detectDraftVariables(this.reportDraft.sql, existing);
  }

  private setVariableOptionValue(key: string, inputValue: string, searchValue: string) {
    this.variableInputs[key] = inputValue;
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: searchValue,
    };
    this.onVariableInputChanged();
  }

  private resetVariableOptionsState() {
    this.variableOptions = {};
    this.loadingVariableOptions = {};
    this.optionsParamsSignatureByKey = {};
  }

  private applyVariableOptionFetchResult(
    key: string,
    signature: string,
    options: ReportVariableOption[]
  ) {
    this.optionsParamsSignatureByKey = {
      ...this.optionsParamsSignatureByKey,
      [key]: signature,
    };
    this.variableOptions = {
      ...this.variableOptions,
      [key]: options,
    };
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: syncOptionSearchText(this.variableInputs[key] ?? '', options),
    };
    this.loadingVariableOptions = {
      ...this.loadingVariableOptions,
      [key]: false,
    };
  }

  private updateSelectedReportArchived(archived: boolean) {
    const current = this.selectedReport;
    if (!current) {
      this.statusMessage = `Selecione um relatório para ${archived ? 'arquivar' : 'desarquivar'}.`;
      return;
    }
    const payload = buildArchivePayload(current, this.selectedFolder, this.folders, archived);
    if (!payload) {
      this.statusMessage = `Não foi possível identificar a pasta do relatório para ${archived ? 'arquivar' : 'desarquivar'}.`;
      return;
    }
    this.reportService.updateReport(current.id, payload).subscribe({
      next: () => {
        this.statusMessage = `Relatório "${current.name}" ${archived ? 'arquivado' : 'desarquivado'}.`;
        this.loadData(archived ? undefined : current.id, archived ? undefined : payload.folderId);
      },
      error: () => {
        this.statusMessage = `Falha ao ${archived ? 'arquivar' : 'desarquivar'} relatório.`;
      },
    });
  }

  private consumePendingSql(): string | null {
    return consumeStoredText(REPORT_DRAFT_SQL_KEY);
  }
}
