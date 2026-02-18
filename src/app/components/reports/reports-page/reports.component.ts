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
  ReportValidationResponse,
  ReportVariable,
  ReportVariableOption,
} from '../../../services/report.service';
import { createXlsxBlob } from '../../../utils/xlsx-export';
import { DraftVariable, FolderNode, ReportDraft, TemplateDraft } from '../core/reports.component.models';
import {
  createEmptyReportDraft,
  createEmptyTemplateDraft,
  REPORT_DRAFT_SQL_KEY,
  REPORTS_FOLDERS_EXPANDED_KEY,
  REPORTS_SIDEBAR_COLLAPSED_KEY,
} from '../core/reports.component.constants';
import { ReportsFolderTemplateHost, ReportsFolderTemplateLogic } from '../core/reports.component.folder-template';
import { ReportsFolderManagerModalComponent } from '../modals/folder-manager-modal/reports-folder-manager-modal.component';
import { MultiSelectOption, ReportsMultiSelectComponent } from '../controls/multi-select/reports-multi-select.component';
import { ReportsReportModalComponent } from '../modals/report-modal/reports-report-modal.component';
import { ReportsTemplateManagerModalComponent } from '../modals/template-manager-modal/reports-template-manager-modal.component';
import {
  buildArchivePayload,
  buildReportValidationParams,
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
  resolveRequestErrorMessage,
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
} from '../core/reports.component.utils';

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
    ReportsMultiSelectComponent,
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
  variableMultiOptionSelections: Record<string, string[]> = {};
  variableMultiSelectOptionsByKey: Record<string, MultiSelectOption[]> = {};
  variableOptions: Record<string, ReportVariableOption[]> = {};
  loadingVariableOptions: Record<string, boolean> = {};
  variableOptionSearchText: Record<string, string> = {};
  reportModalOpen = false;
  reportModalMode: 'create' | 'edit' = 'create';
  reportDraft: ReportDraft = createEmptyReportDraft();
  reportDraftVariables: DraftVariable[] = [];
  reportDraftError = '';
  reportValidationInputs: Record<string, string> = {};
  reportValidationResult: ReportValidationResponse | null = null;
  reportValidationError = '';
  validatingReportDraft = false;
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
      const raw = rawInput || fallback;
      if (!raw) return false;
      if (v.multiple) {
        const items = raw
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (!items.length) return false;
      }
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
    this.resetReportValidationState();
    this.reportDraft = createReportDraftForCreate(folder.id, presetSql);
    this.syncDraftVariablesFromSql();
    this.syncValidationInputsWithDraftVariables();
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
    this.resetReportValidationState();
    this.reportDraft = createReportDraftForEdit(current, folder.id);
    this.syncDraftVariablesFromSql(current.variables || []);
    this.syncValidationInputsWithDraftVariables();
  }

  closeReportModal() {
    this.reportModalOpen = false;
    this.reportDraftError = '';
    this.resetReportValidationState();
  }

  onDraftSqlChanged() {
    this.syncDraftVariablesFromSql(this.reportDraftVariables);
    this.syncValidationInputsWithDraftVariables();
    this.resetReportValidationState();
  }

  onDraftVariablesDrop(event: CdkDragDrop<DraftVariable[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.reportDraftVariables];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.reportDraftVariables = next;
    this.syncValidationInputsWithDraftVariables();
    this.resetReportValidationState();
  }

  onReportValidationInputChange(event: { key: string; value: string }) {
    this.reportValidationInputs = {
      ...this.reportValidationInputs,
      [event.key]: event.value ?? '',
    };
    this.resetReportValidationState();
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
        error: (err) => {
          this.reportDraftError = this.resolveRequestError(err, 'Falha ao criar relatorio.');
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
      error: (err) => {
        this.reportDraftError = this.resolveRequestError(err, 'Falha ao atualizar relatorio.');
      },
    });
  }

  validateReportDraftQuery() {
    const sql = this.reportDraft.sql.trim();
    if (!sql) {
      this.reportValidationError = 'Informe a SQL antes de validar.';
      this.reportValidationResult = null;
      return;
    }

    const variables = toReportVariablesPayload(this.reportDraftVariables);
    const validationParams = buildReportValidationParams(variables, this.reportValidationInputs);
    if (validationParams.error) {
      this.reportValidationError = validationParams.error;
      this.reportValidationResult = null;
      return;
    }

    this.validatingReportDraft = true;
    this.reportValidationError = '';
    this.reportValidationResult = null;
    this.reportService
      .validateReportQuery({
        sql,
        variables,
        params: validationParams.params,
        validateSyntax: !validationParams.hasMissingRequired,
        enforceRequired: true,
        enforceReadOnly: true,
      })
      .subscribe({
        next: (result) => {
          this.validatingReportDraft = false;
          this.reportValidationResult = result;
          if (result?.valid === false && (!result.errors || !result.errors.length)) {
            this.reportValidationError = 'Consulta inválida.';
          }
        },
        error: (err) => {
          this.validatingReportDraft = false;
          this.reportValidationError = this.resolveRequestError(err, 'Falha ao validar consulta.');
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
      error: (err) => {
        this.loadingPdf = false;
        this.statusMessage = this.resolveRequestError(err, 'Falha ao exportar PDF.');
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
      error: (err) => {
        this.reports = [];
        this.templates = [];
        this.folders = [];
        this.runResult = null;
        this.selectedFolderId = null;
        this.selectedReportId = null;
        this.loadingList = false;
        this.statusMessage = this.resolveRequestError(err, 'Falha ao carregar relatorios/pastas.');
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
      error: (err) => {
        this.runResult = null;
        this.loadingRun = false;
        this.statusMessage = this.resolveRequestError(err, 'Falha ao executar relatorio.');
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
    const nextSelections: Record<string, string[]> = {};
    for (const variable of this.selectedReportVariables) {
      if (!variable.multiple || !this.hasVariableOptions(variable)) continue;
      nextSelections[variable.key] = String(this.variableInputs[variable.key] ?? '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    this.variableMultiOptionSelections = nextSelections;
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

  optionValueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  selectedOptionValue(variable: ReportVariable): string {
    return this.optionValueToString(this.variableInputs[variable.key] ?? '');
  }

  onVariableOptionValueSelected(variable: ReportVariable, rawValue: string) {
    const value = this.optionValueToString(rawValue);
    const selected = this.variableOptionItems(variable).find(
      (opt) => this.optionValueToString(opt.valor) === value
    );
    this.setVariableOptionValue(variable.key, value, selected?.descricao ?? '');
  }

  onVariableMultipleOptionValuesSelected(variable: ReportVariable, rawValues: string[] | string) {
    const selectedValues = Array.isArray(rawValues) ? rawValues : [String(rawValues ?? '')];
    const normalized = selectedValues
      .map((value) => this.optionValueToString(value).trim())
      .filter(Boolean);
    this.variableMultiOptionSelections = {
      ...this.variableMultiOptionSelections,
      [variable.key]: normalized,
    };
    this.setVariableOptionValue(variable.key, normalized.join(','), '');
  }

  variableMultiSelectOptions(variable: ReportVariable): MultiSelectOption[] {
    return this.variableMultiSelectOptionsByKey[variable.key] || [];
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

  private syncValidationInputsWithDraftVariables() {
    const next: Record<string, string> = {};
    for (const v of this.reportDraftVariables) {
      const current = this.reportValidationInputs[v.key];
      if (current !== undefined) next[v.key] = current;
      else if (v.defaultValue !== null && v.defaultValue !== undefined) next[v.key] = String(v.defaultValue);
      else next[v.key] = '';
    }
    this.reportValidationInputs = next;
  }

  private resetReportValidationState() {
    this.validatingReportDraft = false;
    this.reportValidationError = '';
    this.reportValidationResult = null;
  }

  private setVariableOptionValue(key: string, inputValue: string, searchValue: string) {
    this.variableInputs[key] = inputValue;
    this.variableOptionSearchText = {
      ...this.variableOptionSearchText,
      [key]: searchValue,
    };
    this.variableMultiOptionSelections = {
      ...this.variableMultiOptionSelections,
      [key]: String(inputValue ?? '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
    this.onVariableInputChanged();
  }

  private resetVariableOptionsState() {
    this.variableOptions = {};
    this.variableMultiSelectOptionsByKey = {};
    this.loadingVariableOptions = {};
    this.optionsParamsSignatureByKey = {};
    this.variableMultiOptionSelections = {};
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
    this.variableMultiSelectOptionsByKey = {
      ...this.variableMultiSelectOptionsByKey,
      [key]: options.map((opt) => ({
        value: this.optionValueToString(opt.valor),
        label: String(opt.descricao ?? ''),
      })),
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
      error: (err) => {
        this.statusMessage = this.resolveRequestError(
          err,
          `Falha ao ${archived ? 'arquivar' : 'desarquivar'} relatório.`
        );
      },
    });
  }

  resolveRequestError(error: unknown, fallback: string): string {
    return resolveRequestErrorMessage(error, fallback, this.manageMode);
  }

  private consumePendingSql(): string | null {
    return consumeStoredText(REPORT_DRAFT_SQL_KEY);
  }
}
