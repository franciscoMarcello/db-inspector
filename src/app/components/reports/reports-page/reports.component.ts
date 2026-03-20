import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import {
  JasperTemplateResponse,
  ReportCompareResponse,
  ReportDefinition,
  ReportFolder,
  ReportRunResponse,
  ReportService,
  ReportValidationResponse,
  ReportVariable,
  ReportVariableOption,
} from '../../../services/report.service';
import { AuthService } from '../../../services/auth.service';
import { DbInspectorService } from '../../../services/db-inspector.service';
import { createXlsxBlob } from '../../../utils/xlsx-export';
import { DraftVariable, FolderNode, ReportDraft, TemplateDraft } from '../core/reports.component.models';
import {
  createEmptyReportDraft,
  createEmptyTemplateDraft,
  REPORT_DRAFT_SQL_KEY,
} from '../core/reports.component.constants';
import { ReportsFolderTemplateHost, ReportsFolderTemplateLogic } from '../core/reports.component.folder-template';
import { ReportsTreeLogic } from '../core/reports.component.tree';
import { ReportsFolderManagerModalComponent } from '../modals/folder-manager-modal/reports-folder-manager-modal.component';
import { MultiSelectOption, ReportsMultiSelectComponent } from '../controls/multi-select/reports-multi-select.component';
import { ReportsReportModalComponent } from '../modals/report-modal/reports-report-modal.component';
import { ReportsTemplateManagerModalComponent } from '../modals/template-manager-modal/reports-template-manager-modal.component';
import { AppButtonComponent } from '../../shared/app-button/app-button.component';
import {
  buildArchivePayload,
  buildClearedFilterState,
  buildRunParams,
  computeVariableInputs,
  createReportDraftForCreate,
  createReportDraftForEdit,
  detectDraftVariables,
  displayVariableOption,
  normalizeFileName,
  rebuildFolderNodes,
  resolveRequestErrorMessage,
  resolveStatusTone,
  StatusTone,
  statusTitleFromTone,
  consumeStoredText,
} from '../core/reports.component.utils';
import { ReportsVariableOptionsHost, ReportsVariableOptionsLogic } from '../core/reports.component.variable-options';
import { ReportsDraftHost, ReportsDraftLogic } from '../core/reports.component.draft';

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
    AppButtonComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrls: [
    './reports.component.css',
    './reports.component.table.css',
    './reports.component.modals.css',
    './reports.component.responsive.css',
  ],
})
export class ReportsComponent
  implements OnInit, OnDestroy, ReportsFolderTemplateHost, ReportsVariableOptionsHost, ReportsDraftHost {
  folders: FolderNode[] = [];
  allFolders: ReportFolder[] = [];
  reports: ReportDefinition[] = [];
  templates: JasperTemplateResponse[] = [];
  runResult: ReportRunResponse | null = null;
  compareResult: ReportCompareResponse | null = null;
  loadingCompare = false;
  showCompareRawData = false;

  selectedFolderId: string | null = null;
  selectedReportId: string | null = null;
  newFolderName = '';
  renameFolderName = '';
  treeFilter = '';
  statusMessage = '';
  paramsError = '';
  loadingRun = false;
  loadingMoreRows = false;
  loadingAllRows = false;
  loadingPdf = false;
  loadingExcel = false;
  exportMenuOpen = false;
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
  reportDraftPreviewRows: Record<string, unknown>[] = [];
  reportDraftPreviewColumns: string[] = [];
  reportDraftPreviewError = '';
  loadingReportDraftPreview = false;
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
  optionsParamsSignatureByKey: Record<string, string> = {};
  private readonly reportPageSize = 500;
  private lastRunParams: Record<string, unknown> | null = null;
  private lastRunReportId: string | null = null;
  private lastLoadedPage = -1;
  private readonly folderTemplateLogic: ReportsFolderTemplateLogic;
  private readonly treeLogic: ReportsTreeLogic;
  private readonly variableOptionsLogic: ReportsVariableOptionsLogic;
  private readonly draftLogic: ReportsDraftLogic;
  private statusClearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private reportService: ReportService,
    private dbService: DbInspectorService,
    private route: ActivatedRoute,
    private auth: AuthService
  ) {
    this.folderTemplateLogic = new ReportsFolderTemplateLogic(this, reportService);
    this.treeLogic = new ReportsTreeLogic();
    this.variableOptionsLogic = new ReportsVariableOptionsLogic(this, reportService);
    this.draftLogic = new ReportsDraftLogic(this, reportService, dbService);
  }

  ngOnInit(): void {
    this.manageMode = this.route.snapshot.data['manage'] === true;
    this.loadPersistedUiState();
    this.pendingCreateSql = this.manageMode ? this.consumePendingSql() : null;
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.statusClearTimer) clearTimeout(this.statusClearTimer);
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

  get canLoadMoreRows(): boolean {
    const result = this.runResult;
    if (!result?.meta?.truncated) return false;
    const rowCount = Number(result.meta?.rowCount ?? 0);
    if (rowCount > 0 && this.displayedRows.length >= rowCount) return false;
    if (!this.selectedReportId) return false;
    return !this.loadingRun && !this.loadingMoreRows && !this.loadingAllRows;
  }

  get canLoadAllRows(): boolean {
    const result = this.runResult;
    if (!result?.meta?.truncated) return false;
    const rowCount = Number(result.meta?.rowCount ?? 0);
    if (rowCount > 0 && this.displayedRows.length >= rowCount) return false;
    if (!this.selectedReportId) return false;
    return !this.loadingRun && !this.loadingMoreRows && !this.loadingAllRows;
  }

  get canExportPdf(): boolean {
    return Boolean(this.selectedReport?.jasperTemplateId);
  }

  get canRunReport(): boolean {
    return !!this.selectedReport && !this.loadingRun;
  }

  get canWriteReports(): boolean {
    return this.auth.hasPermission('REPORT_WRITE') || this.auth.isAdmin();
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

  get primaryReportVariables(): ReportVariable[] {
    const variables = this.selectedReportVariables;
    if (!variables.length) return [];

    const primary = variables.filter((variable) => this.isPrimaryVariable(variable));
    if (primary.length) return primary;

    return variables.slice(0, Math.min(2, variables.length));
  }

  get additionalReportVariables(): ReportVariable[] {
    const primaryKeys = new Set(this.primaryReportVariables.map((variable) => variable.key));
    return this.selectedReportVariables.filter((variable) => !primaryKeys.has(variable.key));
  }

  get statusToneClass(): string {
    return resolveStatusTone(this.statusMessage);
  }

  get statusTitle(): string {
    return statusTitleFromTone(this.statusToneClass as StatusTone);
  }

  reportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.treeLogic.reportsByFolder(this.reports, folder);
  }

  get hasTreeFilter(): boolean {
    return this.treeFilter.trim().length > 0;
  }

  get allFilteredFoldersExpanded(): boolean {
    return this.filteredFolders.length > 0 && this.filteredFolders.every((folder) => folder.expanded);
  }

  get filteredFolders(): FolderNode[] {
    return this.treeLogic.filteredFolders(this.folders, this.reports, this.treeFilter);
  }

  filteredReportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.treeLogic.filteredReportsByFolder(folder, this.reports, this.treeFilter);
  }

  reportCountByFolder(folder: FolderNode): number { return this.reportsByFolder(folder).length; }

  toggleFolder(folderId: string) {
    this.folders = this.treeLogic.toggleFolder(this.folders, folderId);
    this.persistFolderExpandedState();
  }

  toggleAllFoldersExpanded() {
    this.folders = this.treeLogic.toggleAllFoldersExpanded(this.folders, this.filteredFolders);
    this.persistFolderExpandedState();
  }

  clearTreeFilter() { this.treeFilter = ''; }

  selectFolder(folder: FolderNode) {
    const next = this.treeLogic.selectFolder(folder, this.reports);
    this.selectedFolderId = next.selectedFolderId;
    this.selectedReportId = next.selectedReportId;
    this.renameFolderName = folder.name;
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
    const selection = this.treeLogic.selectReport(reportId, this.reports, this.folders);
    if (selection.selectedFolderId) {
      this.selectedFolderId = selection.selectedFolderId;
      this.folders = selection.folders;
      this.persistFolderExpandedState();
    }
    this.selectedReportId = reportId;
    this.statusMessage = '';
    this.paramsError = '';
    this.runResult = null;
    this.compareResult = null;
    this.optionsParamsSignatureByKey = {};
    this.initVariableInputs();
    this.reloadVariableOptions();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.persistSidebarCollapsedState();
  }

  toggleExportMenu(event?: Event) {
    event?.stopPropagation();
    this.exportMenuOpen = !this.exportMenuOpen;
  }

  closeExportMenu() {
    this.exportMenuOpen = false;
  }

  loadDataFromAdmin(preferredReportId?: string, preferredFolderId?: string) {
    this.loadData(preferredReportId, preferredFolderId);
  }

  reloadReports(preferredReportId?: string, preferredFolderId?: string) {
    this.loadData(preferredReportId, preferredFolderId);
  }

  rebuildVisibleFolders(apiFolders: ReportFolder[]) {
    this.rebuildFolders(apiFolders);
  }

  openFolderManager() {
    this.folderTemplateLogic.openFolderManager();
  }

  closeFolderManager() {
    this.folderTemplateLogic.closeFolderManager();
  }

  onFolderManagerSelectionChange(folderId: string) {
    this.folderTemplateLogic.onFolderManagerSelectionChange(folderId);
  }

  createFolder() { this.folderTemplateLogic.createFolder(); }

  createFolderFromReportModal() { this.folderTemplateLogic.createFolderFromReportModal(); }

  renameSelectedFolder() { this.folderTemplateLogic.renameSelectedFolder(); }

  archiveSelectedFolder() { this.folderTemplateLogic.archiveSelectedFolder(); }

  unarchiveSelectedFolder() { this.folderTemplateLogic.unarchiveSelectedFolder(); }

  applyFilters() {
    if (!this.selectedReport) {
      this.statusMessage = 'Selecione um relatório para executar.';
      this.runResult = null;
      return;
    }
    this.runSelectedReport();
  }

  loadMoreResults() {
    if (!this.canLoadMoreRows || !this.selectedReportId || !this.runResult) return;

    const reportId = this.selectedReportId;
    const params = this.resolveParamsForPagination(reportId);
    if (params === null) return;

    const nextPage = this.lastLoadedPage >= 0 ? this.lastLoadedPage + 1 : 1;

    this.loadingMoreRows = true;
    this.reportService
      .runReportWithParamsAndOptions(reportId, params, {
        safe: false,
        page: nextPage,
        size: this.reportPageSize,
      })
      .subscribe({
        next: (res) => {
          const merged = this.mergePagedResult(res, nextPage);
          this.loadingMoreRows = false;

          if (!merged.madeProgress) {
            this.setStatusMessage(
              'Nenhuma nova linha foi carregada. A paginação do backend pode estar retornando páginas repetidas.'
            );
          }
        },
        error: (err) => {
          this.loadingMoreRows = false;
          this.statusMessage = this.resolveAclAwareError(err, 'Falha ao carregar mais resultados.');
        },
      });
  }

  async loadAllResults() {
    if (!this.canLoadAllRows || !this.selectedReportId || !this.runResult) return;

    const reportId = this.selectedReportId;
    const params = this.resolveParamsForPagination(reportId);
    if (params === null) return;

    this.loadingAllRows = true;
    try {
      this.setStatusMessage('Carregando todas as linhas do relatório...');
      const res = await firstValueFrom(
        this.reportService.runReportAllWithParams(reportId, params, false)
      );
      const rows = Array.isArray(res.rows) ? res.rows : [];
      const totalRows = Number(res.meta?.rowCount ?? rows.length);

      this.paramsError = '';
      this.runResult = {
        ...res,
        rows,
        meta: {
          ...res.meta,
          rowCount: totalRows > 0 ? totalRows : rows.length,
          truncated: false,
          page: 0,
          size: rows.length,
        },
      };
      this.lastLoadedPage = 0;
      this.setStatusMessage(`Carga completa concluída (${rows.length} linhas).`, 2500);
    } catch (err) {
      this.statusMessage = this.resolveAclAwareError(err, 'Falha ao carregar todos os resultados.');
    } finally {
      this.loadingAllRows = false;
    }
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
    this.resetReportDraftPreviewState();
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
    this.resetReportDraftPreviewState();
    this.reportDraft = createReportDraftForEdit(current, folder.id);
    this.syncDraftVariablesFromSql(current.variables || []);
    this.syncValidationInputsWithDraftVariables();
  }

  closeReportModal() {
    this.reportModalOpen = false;
    this.reportDraftError = '';
    this.resetReportValidationState();
    this.resetReportDraftPreviewState();
  }

  onDraftSqlChanged() {
    this.syncDraftVariablesFromSql(this.reportDraftVariables);
    this.syncValidationInputsWithDraftVariables();
    this.resetReportValidationState();
    this.resetReportDraftPreviewState();
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
    this.resetReportDraftPreviewState();
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

  saveReportFromModal() { this.draftLogic.saveReportFromModal(); }

  validateReportDraftQuery(onDone?: (result: ReportValidationResponse | null) => void) {
    this.draftLogic.validateReportDraftQuery(onDone);
  }

  saveAndTestReportFromModal() { this.draftLogic.saveAndTestReportFromModal(); }

  executeReportDraftPreview() { this.draftLogic.executeReportDraftPreview(); }

  archiveSelectedReport() { this.updateSelectedReportArchived(true); }

  unarchiveSelectedReport() { this.updateSelectedReportArchived(false); }

  exportExcel() {
    this.closeExportMenu();
    const result = this.runResult;
    const report = this.selectedReport;
    if (!result || !report?.id) return;

    this.loadingExcel = true;
    const params = this.buildRunParams();
    if (params === null) {
      this.loadingExcel = false;
      return;
    }

    firstValueFrom(this.reportService.runReportAllWithParams(report.id, params, false))
      .then((fullResult) => {
        this.loadingExcel = false;
        const exportedRows = fullResult.rows || [];
        const blob = createXlsxBlob(fullResult.columns || result.columns || [], exportedRows);
        this.downloadBlob(blob, `${normalizeFileName(fullResult.name || result.name)}.xlsx`);
        this.setStatusMessage(
          `Exportacao Excel concluida para "${fullResult.name || result.name}" (${exportedRows.length} linhas).`,
          3000
        );
      })
      .catch((err) => {
        this.loadingExcel = false;
        this.setStatusMessage(this.resolveRequestError(err, 'Falha ao exportar Excel.'));
      });
  }

  exportPdf() {
    this.closeExportMenu();
    const report = this.selectedReport;
    if (!report?.id) {
      this.setStatusMessage('Selecione um relatório para exportar PDF.');
      return;
    }
    if (!report.jasperTemplateId) {
      this.setStatusMessage('Este relatório não possui template Jasper vinculado.');
      return;
    }

    const params = this.buildRunParams();
    if (params === null) return;

    this.loadingPdf = true;
    this.reportService.generateReportPdf(report.id, params, true).subscribe({
      next: (blob) => {
        this.loadingPdf = false;
        this.downloadBlob(blob, `${normalizeFileName(report.name)}.pdf`);
        this.setStatusMessage(`Exportacao PDF concluida para "${report.name}".`, 2500);
      },
      error: (err) => {
        this.loadingPdf = false;
        this.setStatusMessage(this.resolveRequestError(err, 'Falha ao exportar PDF.'));
      },
    });
  }

  private loadData(preferredReportId?: string, preferredFolderId?: string) {
    let templatesDenied = false;
    let foldersDenied = false;
    forkJoin({
      folders: this.reportService.listFolders().pipe(
        catchError((err: HttpErrorResponse) => {
          if (Number(err?.status ?? 0) === 403) {
            foldersDenied = true;
            return of<ReportFolder[]>([]);
          }
          throw err;
        })
      ),
      reports: this.reportService.listReports(),
      templates: this.reportService.listTemplates().pipe(
        catchError((err: HttpErrorResponse) => {
          if (Number(err?.status ?? 0) === 403) {
            templatesDenied = true;
            return of<JasperTemplateResponse[]>([]);
          }
          throw err;
        })
      ),
    }).subscribe({
      next: ({ folders, reports, templates }) => {
        const apiFolders = folders || [];
        const apiReports = reports || [];
        const visibleReportsByAcl = this.manageMode ? apiReports : apiReports.filter((report) => this.hasReportAccess(report));
        this.allFolders = apiFolders;
        this.reports = this.manageMode
          ? apiReports
          : visibleReportsByAcl.filter((r) => !r.archived);
        this.templates = (templates || []).filter((t) => !t.archived);
        const baseFolders = this.manageMode
          ? apiFolders
          : apiFolders.filter((f) => !f.archived);
        const visibleFolders = this.manageMode
          ? baseFolders
          : this.buildTreeFolders(baseFolders, this.reports);
        this.rebuildFolders(
          visibleFolders
        );
        this.reconcileSelection(preferredReportId, preferredFolderId);
        if (foldersDenied || templatesDenied) {
          this.statusMessage = '';
        }
        if (this.manageMode && this.pendingCreateSql) {
          const sql = this.pendingCreateSql;
          this.pendingCreateSql = null;
          this.openCreateReportModal(sql);
        }
      },
      error: (err) => {
        this.reports = [];
        this.templates = [];
        this.folders = [];
        this.runResult = null;
        this.selectedFolderId = null;
        this.selectedReportId = null;
        this.statusMessage = this.resolveAclAwareError(err, 'Falha ao carregar relatorios/pastas.');
      },
    });
  }

  private runSelectedReport() {
    if (!this.selectedReportId) {
      this.runResult = null;
      this.lastRunParams = null;
      this.lastRunReportId = null;
      this.lastLoadedPage = -1;
      return;
    }

    const params = this.buildRunParams();
    if (params === null) {
      this.runResult = null;
      this.lastRunParams = null;
      this.lastRunReportId = null;
      this.lastLoadedPage = -1;
      return;
    }

    this.loadingRun = true;
    this.loadingMoreRows = false;
    this.loadingAllRows = false;
    this.reportService.runReportWithParamsAndOptions(this.selectedReportId, params, {
      safe: false,
      page: 0,
      size: this.reportPageSize,
    }).subscribe({
      next: (res) => {
        this.paramsError = '';
        this.runResult = res;
        this.lastRunParams = { ...params };
        this.lastRunReportId = this.selectedReportId;
        this.lastLoadedPage = Number.isFinite(Number(res.meta?.page)) ? Number(res.meta?.page) : 0;
        this.loadingRun = false;
      },
      error: (err) => {
        this.runResult = null;
        this.lastRunParams = null;
        this.lastRunReportId = null;
        this.lastLoadedPage = -1;
        this.loadingRun = false;
        this.statusMessage = this.resolveAclAwareError(err, 'Falha ao executar relatorio.');
      },
    });
  }

  compareSelectedReport() {
    if (!this.selectedReportId) return;

    const params = this.buildRunParams();
    if (params === null) return;

    this.loadingCompare = true;
    this.compareResult = null;
    this.showCompareRawData = false;
    this.runResult = null;
    this.reportService.compareReport(this.selectedReportId, params).subscribe({
      next: (res) => {
        this.loadingCompare = false;
        this.compareResult = res;
      },
      error: (err) => {
        this.loadingCompare = false;
        const status = (err as HttpErrorResponse)?.status;
        if (status === 400) {
          this.statusMessage = 'Este relatório não tem SQL SAP HANA configurado.';
        } else if (status === 503) {
          this.statusMessage = 'SAP HANA não está configurado no servidor.';
        } else if (status === 502) {
          this.statusMessage = 'Erro ao executar a consulta no SAP HANA.';
        } else {
          this.statusMessage = this.resolveAclAwareError(err, 'Falha ao comparar relatório.');
        }
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

  private buildTreeFolders(apiFolders: ReportFolder[], reports: ReportDefinition[]): ReportFolder[] {
    return this.treeLogic.buildTreeFolders(apiFolders, reports);
  }

  private hasReportAccess(report: ReportDefinition): boolean {
    const canView = report.canView;
    const canRun = report.canRun;
    if (canView === undefined && canRun === undefined) return true;
    if (canView === true || canRun === true) return true;
    return false;
  }

  private isPrimaryVariable(variable: ReportVariable): boolean {
    const text = `${variable.key} ${variable.label || ''}`.toLowerCase();
    const isDateLike = variable.type === 'date' || variable.type === 'datetime';
    const isTimeRangeLike = /(data|date|periodo|period|inicial|final|inicio|fim|from|to)/i.test(text);
    return isDateLike || isTimeRangeLike;
  }

  private loadPersistedUiState() {
    const state = this.treeLogic.loadPersistedUiState();
    this.sidebarCollapsed = state.sidebarCollapsed;
    this.persistedFolderExpandedState = state.folderExpandedState;
  }

  private persistSidebarCollapsedState() {
    this.treeLogic.persistSidebarCollapsedState(this.sidebarCollapsed);
  }

  private persistFolderExpandedState() {
    const state = this.treeLogic.buildFolderExpandedState(this.folders);
    this.persistedFolderExpandedState = state;
    this.treeLogic.persistFolderExpandedState(state);
  }

  private reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    const next = this.treeLogic.reconcileSelection(
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
      this.lastRunParams = null;
      this.lastRunReportId = null;
      this.lastLoadedPage = -1;
      this.loadingMoreRows = false;
      this.loadingAllRows = false;
      this.variableOptions = {};
      this.loadingVariableOptions = {};
      this.optionsParamsSignatureByKey = {};
      return;
    }

    this.initVariableInputs();
    this.reloadVariableOptions();
    this.runResult = null;
    this.lastRunParams = null;
    this.lastRunReportId = null;
    this.lastLoadedPage = -1;
    this.loadingMoreRows = false;
    this.loadingAllRows = false;
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
    this.optionsReloadTimer = setTimeout(() => this.variableOptionsLogic.reloadVariableOptions(), 250);
  }

  hasVariableOptions(variable: ReportVariable): boolean {
    return this.variableOptionsLogic.hasVariableOptions(variable);
  }

  variableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return this.variableOptionsLogic.variableOptionItems(variable);
  }

  filteredVariableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return this.variableOptionsLogic.filteredVariableOptionItems(variable);
  }

  variableOptionsLoading(variable: ReportVariable): boolean {
    return this.variableOptionsLogic.variableOptionsLoading(variable);
  }

  onVariableOptionSearchChange(variable: ReportVariable, text: string) {
    this.variableOptionsLogic.onVariableOptionSearchChange(variable, text);
  }

  onVariableOptionSelected(variable: ReportVariable, option: ReportVariableOption | null) {
    this.variableOptionsLogic.onVariableOptionSelected(variable, option);
  }

  optionValueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  selectedOptionValue(variable: ReportVariable): string {
    return this.optionValueToString(this.variableInputs[variable.key] ?? '');
  }

  onVariableOptionValueSelected(variable: ReportVariable, rawValue: string) {
    this.variableOptionsLogic.onVariableOptionValueSelected(variable, rawValue);
  }

  onVariableMultipleOptionValuesSelected(variable: ReportVariable, rawValues: string[] | string) {
    this.variableOptionsLogic.onVariableMultipleOptionValuesSelected(variable, rawValues);
  }

  variableMultiSelectOptions(variable: ReportVariable): MultiSelectOption[] {
    return this.variableOptionsLogic.variableMultiSelectOptions(variable);
  }

  clearVariableOption(variable: ReportVariable) {
    this.variableOptionsLogic.clearVariableOption(variable);
  }

  displayVariableOption(value: ReportVariableOption | string | null): string {
    return displayVariableOption(value);
  }

  private reloadVariableOptions() { this.variableOptionsLogic.reloadVariableOptions(); }

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

  private resolveParamsForPagination(reportId: string): Record<string, unknown> | null {
    if (this.lastRunReportId === reportId && this.lastRunParams) return this.lastRunParams;
    return this.buildRunParams();
  }

  private mergePagedResult(
    res: ReportRunResponse,
    page: number
  ): { madeProgress: boolean; done: boolean; total: number; loaded: number } {
    const previousRows = Array.isArray(this.runResult?.rows) ? this.runResult.rows : [];
    const nextRows = Array.isArray(res?.rows) ? res.rows : [];
    const totalRows = Number(res.meta?.rowCount ?? previousRows.length + nextRows.length);
    let mergedRows = [...previousRows, ...nextRows];
    if (totalRows > 0 && mergedRows.length > totalRows) {
      mergedRows = mergedRows.slice(0, totalRows);
    }

    const madeProgress = mergedRows.length > previousRows.length;
    const hasMoreByCount = totalRows > 0 && mergedRows.length < totalRows;
    const hasMoreByApi = Boolean(res.meta?.truncated);
    const truncated = madeProgress ? hasMoreByApi && hasMoreByCount : false;

    this.paramsError = '';
    this.runResult = {
      ...res,
      columns: res.columns?.length ? res.columns : this.runResult?.columns || [],
      rows: mergedRows,
      meta: {
        ...res.meta,
        page,
        rowCount: totalRows > 0 ? totalRows : mergedRows.length,
        size: this.reportPageSize,
        truncated,
      },
    };
    this.lastLoadedPage = page;

    return {
      madeProgress,
      done: !truncated,
      total: totalRows > 0 ? totalRows : mergedRows.length,
      loaded: mergedRows.length,
    };
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

  private resetReportDraftPreviewState() {
    this.loadingReportDraftPreview = false;
    this.reportDraftPreviewError = '';
    this.reportDraftPreviewRows = [];
    this.reportDraftPreviewColumns = [];
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

  private resolveAclAwareError(error: unknown, fallback: string): string {
    const status = Number((error as any)?.status ?? 0);
    if (status === 403) {
      return 'Acesso negado. Se o ACL padrão deny estiver ativo, solicite ao administrador a liberação de pasta/relatório para seu usuário ou perfil.';
    }
    return this.resolveRequestError(error, fallback);
  }

  private setStatusMessage(message: string, autoClearMs?: number) {
    if (this.statusClearTimer) {
      clearTimeout(this.statusClearTimer);
      this.statusClearTimer = null;
    }
    this.statusMessage = message;
    if (autoClearMs && autoClearMs > 0) {
      this.statusClearTimer = setTimeout(() => {
        this.statusMessage = '';
        this.statusClearTimer = null;
      }, autoClearMs);
    }
  }

  private consumePendingSql(): string | null {
    return consumeStoredText(REPORT_DRAFT_SQL_KEY);
  }

}
