import { Component, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import {
  JasperTemplateResponse,
  ReportColumnsResponse,
  ReportCompareRequest,
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
import {
  DraftVariable,
  FolderNode,
  ReportDraft,
  TemplateDraft,
} from '../core/reports.component.models';
import {
  createEmptyReportDraft,
  createEmptyTemplateDraft,
  REPORT_DRAFT_SQL_KEY,
} from '../core/reports.component.constants';
import {
  ReportsFolderTemplateHost,
  ReportsFolderTemplateLogic,
} from '../core/reports.component.folder-template';
import { ReportsTreeLogic } from '../core/reports.component.tree';
import { ReportsFolderManagerModalComponent } from '../modals/folder-manager-modal/reports-folder-manager-modal.component';
import {
  MultiSelectOption,
  ReportsMultiSelectComponent,
} from '../controls/multi-select/reports-multi-select.component';
import { ReportsReportModalComponent } from '../modals/report-modal/reports-report-modal.component';
import { ReportsTemplateManagerModalComponent } from '../modals/template-manager-modal/reports-template-manager-modal.component';
import type { ReportVersionsChange } from '../modals/versions-modal/reports-versions-modal.component';
import { ReportsVersionsModalComponent } from '../modals/versions-modal/reports-versions-modal.component';
import { ReportsAiToolbarComponent } from '../controls/ai-toolbar/reports-ai-toolbar.component';
import { AppButtonComponent } from '../../shared/app-button/app-button.component';
import {
  CompareToleranceRow,
  ReportsCompareTolerancesComponent,
} from './controls/reports-compare-tolerances.component';
import {
  ResultTableCellContext,
  ResultTableComponent,
  ResultTableHeaderGroup,
} from '../../shared/result-table/result-table.component';
import {
  buildArchivePayload,
  buildClearedFilterState,
  buildRunParams,
  computeVariableInputs,
  createReportDraftForCreate,
  createReportDraftForEdit,
  detectDraftVariables,
  displayVariableOption,
  formatVariableLabel,
  rebuildFolderNodes,
  resolveRequestErrorMessage,
  resolveStatusTone,
  StatusTone,
  statusTitleFromTone,
  consumeStoredText,
} from '../core/reports.component.utils';
import {
  ReportsVariableOptionsHost,
  ReportsVariableOptionsLogic,
} from '../core/reports.component.variable-options';
import { ReportsDraftHost, ReportsDraftLogic } from '../core/reports.component.draft';
import {
  compareCellDiffClass,
  compareColumnDiffValue,
  compareDifferentFields,
  compareDifferentFieldsCountLabel,
  compareDifferentFieldsLabel,
  CompareFieldDetail,
  formatCompareDelta,
  formatCompareDifferenceSummary,
  formatCompareDiffPercent,
} from '../core/reports.component.compare-utils';
import { ReportsCompareLogic } from '../core/reports.component.compare.logic';
import { ReportsRunHost, ReportsRunLogic } from '../core/reports.component.run.logic';
import { ReportsExportHost, ReportsExportLogic } from '../core/reports.component.export.logic';
import {
  ReportsSelectionHost,
  ReportsSelectionLogic,
} from '../core/reports.component.selection.logic';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    ReportsReportModalComponent,
    ReportsFolderManagerModalComponent,
    ReportsTemplateManagerModalComponent,
    ReportsVersionsModalComponent,
    ReportsAiToolbarComponent,
    ReportsMultiSelectComponent,
    ReportsCompareTolerancesComponent,
    AppButtonComponent,
    ResultTableComponent,
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
  implements
    OnInit,
    OnDestroy,
    ReportsFolderTemplateHost,
    ReportsVariableOptionsHost,
    ReportsDraftHost,
    ReportsRunHost,
    ReportsExportHost,
    ReportsSelectionHost
{
  compareToleranceRows: CompareToleranceRow[] = [];
  readonly booleanOptions: MultiSelectOption[] = [
    { value: 'true', label: 'true' },
    { value: 'false', label: 'false' },
  ];
  compareToleranceError = '';
  comparisonColumnsPrefetch: string[] = [];
  folders: FolderNode[] = [];
  allFolders: ReportFolder[] = [];
  reports: ReportDefinition[] = [];
  templates: JasperTemplateResponse[] = [];
  runResult: ReportRunResponse | null = null;
  compareResult: ReportCompareResponse | null = null;
  loadingCompare = false;
  showCompareRawData = false;
  compareExpanded = false;
  compareRawRowLimit = 100;
  compareSourceFilter: 'both' | 'source1' | 'source2' = 'both';
  compareQuickFilter: 'all' | 'different' | 'missingInSystem' | 'missingInSap' | 'duplicates' =
    'all';
  compareDiffViewMode: 'compact' | 'full' = 'compact';

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
  loadingCompareExcel = false;
  loadingCompareRawExcel = false;
  readonly advancedOpen = signal(false);
  private readonly actionsTrigger = viewChild<MatMenuTrigger>('actionsTrigger');
  manageMode = false;
  sidebarCollapsed = false;
  analysisMode = false;
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
  versionsModalOpen = false;
  versionsParamInputs: Record<string, string> = {};
  selectedTemplateId: string | null = null;
  templateDraft: TemplateDraft = createEmptyTemplateDraft();
  templateDraftError = '';
  templateDraftStatus = '';
  templateFileName = '';
  loadingTemplate = false;
  creatingTemplate = false;
  persistedFolderExpandedState: Record<string, boolean> = {};
  private pendingCreateSql: string | null = null;
  private optionsReloadTimer: ReturnType<typeof setTimeout> | null = null;
  optionsParamsSignatureByKey: Record<string, string> = {};
  reportPageSize = 500;
  lastRunParams: Record<string, unknown> | null = null;
  lastRunReportId: string | null = null;
  lastLoadedPage = -1;
  private readonly folderTemplateLogic: ReportsFolderTemplateLogic;
  private readonly treeLogic: ReportsTreeLogic;
  private readonly variableOptionsLogic: ReportsVariableOptionsLogic;
  private readonly draftLogic: ReportsDraftLogic;
  private readonly runLogic: ReportsRunLogic;
  private readonly exportLogic: ReportsExportLogic;
  private readonly compareLogic: ReportsCompareLogic;
  private readonly selectionLogic: ReportsSelectionLogic;
  private statusClearTimer: ReturnType<typeof setTimeout> | null = null;
  private compareColumnsLoadSeq = 0;

  constructor(
    private reportService: ReportService,
    private dbService: DbInspectorService,
    private route: ActivatedRoute,
    private auth: AuthService,
  ) {
    this.folderTemplateLogic = new ReportsFolderTemplateLogic(this, reportService);
    this.treeLogic = new ReportsTreeLogic();
    this.variableOptionsLogic = new ReportsVariableOptionsLogic(this, reportService);
    this.draftLogic = new ReportsDraftLogic(this, reportService, dbService);
    this.runLogic = new ReportsRunLogic(this, reportService);
    this.exportLogic = new ReportsExportLogic(this, reportService);
    this.compareLogic = new ReportsCompareLogic();
    this.selectionLogic = new ReportsSelectionLogic(this, this.treeLogic);
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
      ? (this.reports.find((report) => report.id === this.selectedReportId) ?? null)
      : null;
  }

  get selectedFolder(): FolderNode | null {
    return this.selectedFolderId
      ? (this.folders.find((folder) => folder.id === this.selectedFolderId) ?? null)
      : null;
  }

  get availableComparisonColumns(): string[] {
    const options = new Set<string>();
    for (const col of this.comparisonColumnsPrefetch) options.add(col);
    if (this.compareResult) {
      for (const col of this.compareResult.source1.columns) options.add(col);
      for (const col of this.compareResult.source2.columns) options.add(col);
    } else if (this.runResult) {
      for (const col of this.runResult.columns) options.add(col);
    }
    return [...options]
      .map((col) => String(col ?? '').trim())
      .filter((col) => col.length > 0)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  onCompareToleranceRowsChange(rows: CompareToleranceRow[]) {
    this.compareToleranceRows = rows;
    if (!rows.length) this.compareToleranceError = '';
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

  get orderedReportVariables(): ReportVariable[] {
    return [...this.primaryReportVariables, ...this.additionalReportVariables];
  }

  get activeToleranceCount(): number {
    return this.compareToleranceRows.filter((row) => row.field).length;
  }

  variableLabel(variable: ReportVariable): string {
    return formatVariableLabel(variable.key, variable.label);
  }

  toggleAdvanced() {
    this.advancedOpen.update((open) => !open);
  }

  get statusToneClass(): string {
    return resolveStatusTone(this.statusMessage);
  }

  get statusTitle(): string {
    return statusTitleFromTone(this.statusToneClass as StatusTone);
  }

  get hasDuplicateKeysInCompare(): boolean {
    const result = this.compareResult;
    if (!result) return false;
    return result.duplicateKeysSource1.length > 0 || result.duplicateKeysSource2.length > 0;
  }

  get compareModeDescription(): string {
    const result = this.compareResult;
    if (!result) return '';
    if (result.mode === 'keyed' && result.comparisonKey) {
      return `Comparação por chave: ${result.comparisonKey}`;
    }
    return 'Sem chave de comparação, usando comparação por conteúdo.';
  }

  get showCompareMissingInSapSection(): boolean {
    return this.compareQuickFilter === 'all' || this.compareQuickFilter === 'missingInSap';
  }

  get showCompareMissingInSystemSection(): boolean {
    return this.compareQuickFilter === 'all' || this.compareQuickFilter === 'missingInSystem';
  }

  get showCompareDifferencesSection(): boolean {
    return this.compareQuickFilter === 'all' || this.compareQuickFilter === 'different';
  }

  get showCompareDuplicatesSection(): boolean {
    return this.compareQuickFilter === 'all' || this.compareQuickFilter === 'duplicates';
  }

  get showCompareSource1(): boolean {
    return this.compareSourceFilter === 'both' || this.compareSourceFilter === 'source1';
  }

  get showCompareSource2(): boolean {
    return this.compareSourceFilter === 'both' || this.compareSourceFilter === 'source2';
  }

  compareDisplayLabel(label: string | null | undefined, fallback = 'Agromobi'): string {
    const value = (label || '').trim();
    if (!value || value.toLowerCase() === 'sistema') return fallback;
    return value;
  }

  comparePercent(value: number, total: number): number {
    if (!total) return 0;
    return Math.round((Number(value || 0) / Number(total || 0)) * 100);
  }

  compareDifferentPercent(cmp: ReportCompareResponse): number {
    return cmp.diff ? this.comparePercent(cmp.diff.differentCount, cmp.diff.matchCount) : 0;
  }

  compareEqualPercent(cmp: ReportCompareResponse): number {
    return cmp.diff ? this.comparePercent(cmp.diff.equalCount, cmp.diff.matchCount) : 0;
  }

  compareDivergenceAlert(cmp: ReportCompareResponse): string {
    if (!cmp.diff || !cmp.diff.matchCount || !cmp.diff.differentCount) return '';
    const percent = this.compareDifferentPercent(cmp);
    return `${percent}% dos registros comparados possuem divergência.`;
  }

  formatDuplicateKeys(list: Array<{ key: string; count: number }>): string {
    return list.map((item) => `${item.key} (${item.count})`).join(', ');
  }

  showMoreCompareRawRows() {
    this.compareRawRowLimit += 200;
  }

  compareDifferenceSourceRow(
    cmp: ReportCompareResponse,
    item: {
      key: string | null;
      fields: Record<string, CompareFieldDetail>;
      source1Row?: Record<string, unknown> | null;
      source2Row?: Record<string, unknown> | null;
    },
    source: 'source1' | 'source2',
  ): Record<string, unknown> {
    return this.compareLogic.compareDifferenceSourceRow(cmp, item, source);
  }

  compareDifferentFields(item: { fields: Record<string, CompareFieldDetail> }): string[] {
    return compareDifferentFields(item);
  }

  compareDifferentFieldsLabel(item: { fields: Record<string, CompareFieldDetail> }): string {
    return compareDifferentFieldsLabel(item);
  }

  compareDifferentFieldsCountLabel(item: { fields: Record<string, CompareFieldDetail> }): string {
    return compareDifferentFieldsCountLabel(item);
  }

  compareDifferenceRows(cmp: ReportCompareResponse) {
    return this.compareLogic.compareDifferenceRows(cmp);
  }

  compareCompactTableColumns(cmp: ReportCompareResponse): string[] {
    return this.compareLogic.compareCompactTableColumns(cmp);
  }

  compareCompactTableRows(cmp: ReportCompareResponse): Record<string, unknown>[] {
    return this.compareLogic.compareCompactTableRows(cmp);
  }

  compareCompactCellClass = (context: ResultTableCellContext): string => {
    const classes = context.row['__cellClasses'];
    if (!classes || typeof classes !== 'object' || Array.isArray(classes)) return '';
    const classMap = classes as Record<string, unknown>;
    const value = classMap[context.column];
    return typeof value === 'string' ? value : '';
  };

  compareFullTableColumns(cmp: ReportCompareResponse): string[] {
    return this.compareLogic.compareFullTableColumns(cmp);
  }

  compareFullTableColumnLabels(cmp: ReportCompareResponse): Record<string, string> {
    return this.compareLogic.compareFullTableColumnLabels(cmp);
  }

  compareFullTableHeaderGroups(cmp: ReportCompareResponse): ResultTableHeaderGroup[] {
    return this.compareLogic.compareFullTableHeaderGroups(cmp);
  }

  compareFullTableRows(cmp: ReportCompareResponse): Record<string, unknown>[] {
    return this.compareLogic.compareFullTableRows(cmp);
  }

  compareFullCellClass = (context: ResultTableCellContext): string => {
    const classes = context.row['__cellClasses'];
    if (!classes || typeof classes !== 'object' || Array.isArray(classes)) return '';
    const classMap = classes as Record<string, unknown>;
    const value = classMap[context.column];
    return typeof value === 'string' ? value : '';
  };

  compareFieldStats(cmp: ReportCompareResponse): Array<{ field: string; count: number }> {
    return this.compareLogic.compareFieldStats(cmp);
  }

  compareCellDiffClass(
    item: { fields: Record<string, CompareFieldDetail> },
    column: string,
  ): Record<string, boolean> {
    return compareCellDiffClass(item, column);
  }

  compareFieldDetail(
    item: { fields: Record<string, CompareFieldDetail> },
    field: string,
  ): CompareFieldDetail {
    return item.fields?.[field] ?? {};
  }

  formatCompareDelta(value: unknown): string {
    return formatCompareDelta(value);
  }

  compareColumnDiffValue(
    item: { fields: Record<string, CompareFieldDetail> },
    column: string,
  ): string {
    return compareColumnDiffValue(item, column);
  }

  formatCompareDiffPercent(row: { source2: unknown; diff: unknown }): string {
    return formatCompareDiffPercent(row);
  }

  compareValueTitle(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  formatCompareDifferenceSummary(item: { fields: Record<string, CompareFieldDetail> }): string {
    return formatCompareDifferenceSummary(item);
  }

  reportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.treeLogic.reportsByFolder(this.reports, folder);
  }

  get hasTreeFilter(): boolean {
    return this.treeFilter.trim().length > 0;
  }

  get allFilteredFoldersExpanded(): boolean {
    return (
      this.filteredFolders.length > 0 && this.filteredFolders.every((folder) => folder.expanded)
    );
  }

  get filteredFolders(): FolderNode[] {
    return this.treeLogic.filteredFolders(this.folders, this.reports, this.treeFilter);
  }

  filteredReportsByFolder(folder: FolderNode): ReportDefinition[] {
    return this.treeLogic.filteredReportsByFolder(folder, this.reports, this.treeFilter);
  }

  reportCountByFolder(folder: FolderNode): number {
    return this.reportsByFolder(folder).length;
  }

  toggleFolder(folderId: string) {
    this.selectionLogic.toggleFolder(folderId);
  }

  toggleAllFoldersExpanded() {
    this.selectionLogic.toggleAllFoldersExpanded(this.filteredFolders);
  }

  clearTreeFilter() {
    this.treeFilter = this.selectionLogic.clearTreeFilter();
  }

  selectFolder(folder: FolderNode) {
    this.selectionLogic.selectFolder(folder);
    if (!folder.expanded) this.toggleFolder(folder.id);
  }

  selectReport(reportId: string) {
    this.selectionLogic.selectReport(reportId);
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.persistSidebarCollapsedState();
  }

  toggleAnalysisMode() {
    this.analysisMode = !this.analysisMode;
    if (this.analysisMode && !this.sidebarCollapsed) {
      this.sidebarCollapsed = true;
      this.persistSidebarCollapsedState();
    }
  }

  closeExportMenu() {
    this.actionsTrigger()?.closeMenu();
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

  createFolder() {
    this.folderTemplateLogic.createFolder();
  }

  createFolderFromReportModal() {
    this.folderTemplateLogic.createFolderFromReportModal();
  }

  renameSelectedFolder() {
    this.folderTemplateLogic.renameSelectedFolder();
  }

  archiveSelectedFolder() {
    this.folderTemplateLogic.archiveSelectedFolder();
  }

  unarchiveSelectedFolder() {
    this.folderTemplateLogic.unarchiveSelectedFolder();
  }

  applyFilters() {
    if (!this.selectedReport) {
      this.statusMessage = 'Selecione um relatório para executar.';
      this.runResult = null;
      return;
    }
    this.runSelectedReport();
  }

  loadMoreResults() {
    this.runLogic.loadMoreResults();
  }

  async loadAllResults() {
    await this.runLogic.loadAllResults();
  }

  clearAllFilters() {
    const next = buildClearedFilterState(
      this.selectedReportVariables,
      this.variableOptionSearchText,
    );
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

  openTemplateManager() {
    this.folderTemplateLogic.openTemplateManager();
  }

  closeTemplateManager() {
    this.folderTemplateLogic.closeTemplateManager();
  }

  startNewTemplate() {
    this.folderTemplateLogic.startNewTemplate();
  }

  selectTemplate(templateId: string) {
    this.folderTemplateLogic.selectTemplate(templateId);
  }

  async onTemplateManagerFileSelected(event: Event) {
    await this.folderTemplateLogic.onTemplateManagerFileSelected(event);
  }

  saveTemplateFromModal() {
    this.folderTemplateLogic.saveTemplateFromModal();
  }

  deleteTemplateFromManager() {
    this.folderTemplateLogic.deleteTemplateFromManager();
  }

  saveReportFromModal() {
    this.draftLogic.saveReportFromModal();
  }

  validateReportDraftQuery(onDone?: (result: ReportValidationResponse | null) => void) {
    this.draftLogic.validateReportDraftQuery(onDone);
  }

  saveAndTestReportFromModal() {
    this.draftLogic.saveAndTestReportFromModal();
  }

  executeReportDraftPreview() {
    this.draftLogic.executeReportDraftPreview();
  }

  archiveSelectedReport() {
    this.updateSelectedReportArchived(true);
  }

  openVersionsModal() {
    if (!this.selectedReport || !this.canWriteReports) return;
    this.versionsParamInputs = { ...this.variableInputs };
    this.versionsModalOpen = true;
  }

  closeVersionsModal() {
    this.versionsModalOpen = false;
  }

  onReportVersionsChanged(change: ReportVersionsChange) {
    if (!change.reportDeleted) {
      this.loadData(change.reportId);
      return;
    }
    this.versionsModalOpen = false;
    this.reports = this.reports.filter((report) => report.id !== change.reportId);
    if (this.selectedReportId === change.reportId) {
      this.selectedReportId = null;
      this.runResult = null;
      this.compareResult = null;
    }
    this.setStatusMessage(change.message);
    this.loadData(undefined, this.selectedFolderId ?? undefined);
  }

  unarchiveSelectedReport() {
    this.updateSelectedReportArchived(false);
  }

  exportExcel() {
    this.exportLogic.exportExcel();
  }

  exportCompareExcel() {
    this.exportLogic.exportCompareExcel();
  }

  exportCompareRawExcel() {
    this.exportLogic.exportCompareRawExcel();
  }

  exportPdf() {
    this.exportLogic.exportPdf();
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
        }),
      ),
      reports: this.reportService.listReports(),
      templates: this.reportService.listTemplates().pipe(
        catchError((err: HttpErrorResponse) => {
          if (Number(err?.status ?? 0) === 403) {
            templatesDenied = true;
            return of<JasperTemplateResponse[]>([]);
          }
          throw err;
        }),
      ),
    }).subscribe({
      next: ({ folders, reports, templates }) => {
        const apiFolders = folders || [];
        const apiReports = reports || [];
        const visibleReportsByAcl = this.manageMode
          ? apiReports
          : apiReports.filter((report) => this.hasReportAccess(report));
        this.allFolders = apiFolders;
        this.reports = this.manageMode
          ? apiReports
          : visibleReportsByAcl.filter((r) => !r.archived);
        this.templates = (templates || []).filter((t) => !t.archived);
        const baseFolders = this.manageMode ? apiFolders : apiFolders.filter((f) => !f.archived);
        const visibleFolders = this.manageMode
          ? baseFolders
          : this.buildTreeFolders(baseFolders, this.reports);
        this.rebuildFolders(visibleFolders);
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
        this.comparisonColumnsPrefetch = [];
        this.statusMessage = this.resolveAclAwareError(err, 'Falha ao carregar relatorios/pastas.');
      },
    });
  }

  private runSelectedReport() {
    this.runLogic.runSelectedReport();
  }

  compareSelectedReport() {
    if (!this.selectedReportId) return;

    const params = this.buildRunParams();
    if (params === null) return;

    const comparisonTolerances = this.buildComparisonTolerances();
    if (comparisonTolerances === null) {
      this.advancedOpen.set(true);
      return;
    }

    this.loadingCompare = true;
    this.compareResult = null;
    this.compareQuickFilter = 'all';
    this.compareExpanded = false;
    this.compareRawRowLimit = 100;
    this.compareSourceFilter = 'both';
    this.compareDiffViewMode = 'compact';
    this.showCompareRawData = false;
    this.runResult = null;
    const request: ReportCompareRequest = { params };
    if (Object.keys(comparisonTolerances).length) {
      request.comparisonTolerances = comparisonTolerances;
    }

    this.reportService.compareReport(this.selectedReportId, request).subscribe({
      next: (res) => {
        this.loadingCompare = false;
        this.compareResult = res;
      },
      error: (err) => {
        this.loadingCompare = false;
        const status = (err as HttpErrorResponse)?.status;
        const backendMessage = this.extractErrorMessage(err).toLowerCase();
        if (
          status === 400 &&
          (backendMessage.includes('campo de comparacao') ||
            backendMessage.includes('campo de comparação')) &&
          backendMessage.includes('ausente')
        ) {
          this.statusMessage =
            'A coluna de comparação não foi encontrada em uma das consultas. Edite o relatório/SQL e ajuste o campo comparisonKey para continuar.';
        } else if (status === 400) {
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

  private buildComparisonTolerances(): Record<string, number> | null {
    const tolerances: Record<string, number> = {};

    for (const row of this.compareToleranceRows) {
      const field = String(row.field ?? '').trim();
      const rawTolerance = String(row.tolerance ?? '').trim();
      const isCompletelyEmpty = !field && !rawTolerance;
      if (isCompletelyEmpty) continue;

      if (!field) {
        this.compareToleranceError = 'Preencha o nome do campo em todas as tolerâncias.';
        return null;
      }

      const numericTolerance = Number(rawTolerance);
      if (!rawTolerance || !Number.isFinite(numericTolerance)) {
        this.compareToleranceError = 'A tolerância deve ser numérica e finita.';
        return null;
      }

      if (numericTolerance < 0) {
        this.compareToleranceError = 'A tolerância deve ser maior ou igual a zero.';
        return null;
      }

      tolerances[field] = numericTolerance;
    }

    this.compareToleranceError = '';
    return tolerances;
  }

  private rebuildFolders(apiFolders: ReportFolder[]) {
    this.folders = rebuildFolderNodes(
      apiFolders || [],
      this.folders,
      this.persistedFolderExpandedState,
    );

    if (
      this.selectedFolderId &&
      !this.folders.some((folder) => folder.id === this.selectedFolderId)
    ) {
      this.selectedFolderId = null;
    }

    this.persistFolderExpandedState();
  }

  private buildTreeFolders(
    apiFolders: ReportFolder[],
    reports: ReportDefinition[],
  ): ReportFolder[] {
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
    const isTimeRangeLike = /(data|date|periodo|period|inicial|final|inicio|fim|from|to)/i.test(
      text,
    );
    return isDateLike || isTimeRangeLike;
  }

  private loadPersistedUiState() {
    this.selectionLogic.loadPersistedUiState();
  }

  private persistSidebarCollapsedState() {
    this.selectionLogic.persistSidebarCollapsedState();
  }

  private persistFolderExpandedState() {
    this.selectionLogic.persistFolderExpandedState();
  }

  private reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    this.selectionLogic.reconcileSelection(preferredReportId, preferredFolderId);
  }

  loadComparisonColumnsForSelectedReport() {
    const report = this.selectedReport;
    if (!report?.id || !report.secondSql) {
      this.comparisonColumnsPrefetch = [];
      return;
    }

    const currentSeq = ++this.compareColumnsLoadSeq;
    this.reportService.getReportColumns(report.id, 'both').subscribe({
      next: (res: ReportColumnsResponse) => {
        if (currentSeq !== this.compareColumnsLoadSeq) return;
        this.comparisonColumnsPrefetch = res.mergedColumns || [];
      },
      error: () => {
        if (currentSeq !== this.compareColumnsLoadSeq) return;
        this.comparisonColumnsPrefetch = [];
      },
    });
  }

  initVariableInputs() {
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
    this.optionsReloadTimer = setTimeout(
      () => this.variableOptionsLogic.reloadVariableOptions(),
      250,
    );
  }

  onVariableBooleanChange(key: string, value: string) {
    this.variableInputs[key] = value;
    this.onVariableInputChanged();
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

  reloadVariableOptions() {
    this.variableOptionsLogic.reloadVariableOptions();
  }

  buildRunParams(): Record<string, unknown> | null {
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
      else if (v.defaultValue !== null && v.defaultValue !== undefined)
        next[v.key] = String(v.defaultValue);
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
          `Falha ao ${archived ? 'arquivar' : 'desarquivar'} relatório.`,
        );
      },
    });
  }

  resolveRequestError(error: unknown, fallback: string): string {
    return resolveRequestErrorMessage(error, fallback, this.manageMode);
  }

  private extractErrorMessage(err: unknown): string {
    const error = (err as HttpErrorResponse)?.error;
    if (typeof error === 'string') return error;
    if (typeof error?.message === 'string') return error.message;
    if (typeof error?.error === 'string') return error.error;
    return '';
  }

  resolveAclAwareError(error: unknown, fallback: string): string {
    const status = Number((error as any)?.status ?? 0);
    if (status === 403) {
      return 'Acesso negado. Se o ACL padrão deny estiver ativo, solicite ao administrador a liberação de pasta/relatório para seu usuário ou perfil.';
    }
    return this.resolveRequestError(error, fallback);
  }

  setStatusMessage(message: string, autoClearMs?: number) {
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
