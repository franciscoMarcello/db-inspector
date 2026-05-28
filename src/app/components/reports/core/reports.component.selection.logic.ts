import { ReportDefinition } from '../../../services/report.service';
import { FolderNode } from './reports.component.models';
import { ReportsTreeLogic } from './reports.component.tree';

export interface ReportsSelectionHost {
  folders: FolderNode[];
  reports: ReportDefinition[];
  selectedFolderId: string | null;
  selectedReportId: string | null;
  renameFolderName: string;
  runResult: unknown;
  statusMessage: string;
  paramsError: string;
  compareResult: unknown;
  compareExpanded: boolean;
  compareRawRowLimit: number;
  compareSourceFilter: 'both' | 'source1' | 'source2';
  compareQuickFilter: 'all' | 'different' | 'missingInSystem' | 'missingInSap' | 'duplicates';
  compareDiffViewMode: 'compact' | 'full';
  optionsParamsSignatureByKey: Record<string, string>;
  comparisonColumnsPrefetch: string[];
  sidebarCollapsed: boolean;
  persistedFolderExpandedState: Record<string, boolean>;
  lastRunParams: Record<string, unknown> | null;
  lastRunReportId: string | null;
  lastLoadedPage: number;
  loadingMoreRows: boolean;
  loadingAllRows: boolean;
  variableOptions: Record<string, unknown[]>;
  loadingVariableOptions: Record<string, boolean>;
  initVariableInputs(): void;
  reloadVariableOptions(): void;
  loadComparisonColumnsForSelectedReport(): void;
}

export class ReportsSelectionLogic {
  constructor(
    private readonly host: ReportsSelectionHost,
    private readonly treeLogic: ReportsTreeLogic
  ) {}

  toggleFolder(folderId: string) {
    this.host.folders = this.treeLogic.toggleFolder(this.host.folders, folderId);
    this.persistFolderExpandedState();
  }

  toggleAllFoldersExpanded(filteredFolders: FolderNode[]) {
    this.host.folders = this.treeLogic.toggleAllFoldersExpanded(this.host.folders, filteredFolders);
    this.persistFolderExpandedState();
  }

  clearTreeFilter() {
    return '';
  }

  selectFolder(folder: FolderNode) {
    const next = this.treeLogic.selectFolder(folder, this.host.reports);
    this.host.selectedFolderId = next.selectedFolderId;
    this.host.selectedReportId = next.selectedReportId;
    this.host.renameFolderName = folder.name;
    this.host.runResult = null;
    this.host.statusMessage = '';
    this.host.optionsParamsSignatureByKey = {};
    if (this.host.selectedReportId) {
      this.host.initVariableInputs();
      this.host.reloadVariableOptions();
      this.host.runResult = null;
      this.host.loadComparisonColumnsForSelectedReport();
    } else {
      this.host.comparisonColumnsPrefetch = [];
    }
  }

  selectReport(reportId: string) {
    const selection = this.treeLogic.selectReport(reportId, this.host.reports, this.host.folders);
    if (selection.selectedFolderId) {
      this.host.selectedFolderId = selection.selectedFolderId;
      this.host.folders = selection.folders;
      this.persistFolderExpandedState();
    }
    this.host.selectedReportId = reportId;
    this.host.statusMessage = '';
    this.host.paramsError = '';
    this.host.runResult = null;
    this.host.compareResult = null;
    this.host.compareExpanded = false;
    this.host.compareRawRowLimit = 100;
    this.host.compareSourceFilter = 'both';
    this.host.compareQuickFilter = 'all';
    this.host.compareDiffViewMode = 'compact';
    this.host.optionsParamsSignatureByKey = {};
    this.host.initVariableInputs();
    this.host.reloadVariableOptions();
    this.host.loadComparisonColumnsForSelectedReport();
  }

  loadPersistedUiState() {
    const state = this.treeLogic.loadPersistedUiState();
    this.host.sidebarCollapsed = state.sidebarCollapsed;
    this.host.persistedFolderExpandedState = state.folderExpandedState;
  }

  persistSidebarCollapsedState() {
    this.treeLogic.persistSidebarCollapsedState(this.host.sidebarCollapsed);
  }

  persistFolderExpandedState() {
    const state = this.treeLogic.buildFolderExpandedState(this.host.folders);
    this.host.persistedFolderExpandedState = state;
    this.treeLogic.persistFolderExpandedState(state);
  }

  reconcileSelection(preferredReportId?: string, preferredFolderId?: string) {
    const next = this.treeLogic.reconcileSelection(
      this.host.reports,
      this.host.folders,
      this.host.selectedFolderId,
      this.host.selectedReportId,
      preferredReportId,
      preferredFolderId
    );
    this.host.selectedFolderId = next.selectedFolderId;
    this.host.selectedReportId = next.selectedReportId;

    if (!this.host.selectedReportId) {
      this.host.runResult = null;
      this.host.lastRunParams = null;
      this.host.lastRunReportId = null;
      this.host.lastLoadedPage = -1;
      this.host.loadingMoreRows = false;
      this.host.loadingAllRows = false;
      this.host.variableOptions = {};
      this.host.loadingVariableOptions = {};
      this.host.optionsParamsSignatureByKey = {};
      this.host.comparisonColumnsPrefetch = [];
      return;
    }

    this.host.initVariableInputs();
    this.host.reloadVariableOptions();
    this.host.runResult = null;
    this.host.lastRunParams = null;
    this.host.lastRunReportId = null;
    this.host.lastLoadedPage = -1;
    this.host.loadingMoreRows = false;
    this.host.loadingAllRows = false;
    this.host.loadComparisonColumnsForSelectedReport();
  }
}
