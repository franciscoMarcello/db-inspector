import { ReportDefinition, ReportFolder } from '../../../services/report.service';
import { REPORTS_FOLDERS_EXPANDED_KEY, REPORTS_SIDEBAR_COLLAPSED_KEY } from './reports.component.constants';
import { FolderNode } from './reports.component.models';
import {
  belongsToFolder,
  readBooleanRecord,
  readFlag,
  resolveSelection,
  writeBooleanRecord,
  writeFlag,
} from './reports.component.utils';

export class ReportsTreeLogic {
  reportsByFolder(reports: ReportDefinition[], folder: FolderNode): ReportDefinition[] {
    return reports.filter((report) => belongsToFolder(report, folder));
  }

  filteredFolders(folders: FolderNode[], reports: ReportDefinition[], treeFilter: string): FolderNode[] {
    const term = treeFilter.trim().toLowerCase();
    if (!term) return folders;
    return folders.filter((folder) => {
      const folderMatch = folder.name.toLowerCase().includes(term);
      if (folderMatch) return true;
      return this.reportsByFolder(reports, folder).some((report) => report.name.toLowerCase().includes(term));
    });
  }

  filteredReportsByFolder(
    folder: FolderNode,
    reports: ReportDefinition[],
    treeFilter: string
  ): ReportDefinition[] {
    const term = treeFilter.trim().toLowerCase();
    const byFolder = this.reportsByFolder(reports, folder);
    if (!term) return byFolder;
    const folderMatch = folder.name.toLowerCase().includes(term);
    if (folderMatch) return byFolder;
    return byFolder.filter((report) => report.name.toLowerCase().includes(term));
  }

  toggleFolder(folders: FolderNode[], folderId: string): FolderNode[] {
    return folders.map((folder) =>
      folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder
    );
  }

  toggleAllFoldersExpanded(folders: FolderNode[], filteredFolders: FolderNode[]): FolderNode[] {
    const shouldExpand = !filteredFolders.every((folder) => folder.expanded);
    const targetIds = new Set(filteredFolders.map((folder) => folder.id));
    return folders.map((folder) =>
      targetIds.has(folder.id) ? { ...folder, expanded: shouldExpand } : folder
    );
  }

  selectFolder(folder: FolderNode, reports: ReportDefinition[]): { selectedFolderId: string; selectedReportId: string | null } {
    const first = this.reportsByFolder(reports, folder)[0];
    return {
      selectedFolderId: folder.id,
      selectedReportId: first?.id ?? null,
    };
  }

  selectReport(
    reportId: string,
    reports: ReportDefinition[],
    folders: FolderNode[]
  ): { selectedFolderId: string | null; folders: FolderNode[] } {
    const report = reports.find((item) => item.id === reportId);
    if (!report) return { selectedFolderId: null, folders };
    const folder = folders.find((candidate) => belongsToFolder(report, candidate));
    if (!folder) return { selectedFolderId: null, folders };
    return {
      selectedFolderId: folder.id,
      folders: folders.map((candidate) =>
        candidate.id === folder.id ? { ...candidate, expanded: true } : candidate
      ),
    };
  }

  buildTreeFolders(apiFolders: ReportFolder[], reports: ReportDefinition[]): ReportFolder[] {
    const foldersById = new Map<string, ReportFolder>();
    const foldersByName = new Map<string, ReportFolder>();
    const visibleFolderIds = new Set<string>();
    for (const folder of apiFolders) {
      foldersById.set(String(folder.id), folder);
      foldersByName.set(String(folder.name || '').toLowerCase(), folder);
    }

    for (const report of reports) {
      const reportFolderId = String(report.folderId || '').trim();
      const reportFolderName = String(report.folderName || report.templateName || '').trim();
      const byId = reportFolderId ? foldersById.get(reportFolderId) : undefined;
      const byName = reportFolderName ? foldersByName.get(reportFolderName.toLowerCase()) : undefined;
      if (byId) {
        visibleFolderIds.add(String(byId.id));
        continue;
      }
      if (byName) {
        visibleFolderIds.add(String(byName.id));
        continue;
      }

      if (reportFolderId || reportFolderName) {
        const virtualFolder: ReportFolder = {
          id: reportFolderId || `virtual-${reportFolderName.toLowerCase().replace(/\s+/g, '-')}`,
          name: reportFolderName || 'Sem pasta',
          description: null,
          archived: false,
        };
        foldersById.set(String(virtualFolder.id), virtualFolder);
        foldersByName.set(String(virtualFolder.name || '').toLowerCase(), virtualFolder);
        visibleFolderIds.add(String(virtualFolder.id));
      }
    }

    return Array.from(foldersById.values()).filter((folder) => visibleFolderIds.has(String(folder.id)));
  }

  reconcileSelection(
    reports: ReportDefinition[],
    folders: FolderNode[],
    selectedFolderId: string | null,
    selectedReportId: string | null,
    preferredReportId?: string,
    preferredFolderId?: string
  ): { selectedFolderId: string | null; selectedReportId: string | null } {
    return resolveSelection(
      reports,
      folders,
      selectedFolderId,
      selectedReportId,
      preferredReportId,
      preferredFolderId
    );
  }

  loadPersistedUiState(): {
    sidebarCollapsed: boolean;
    folderExpandedState: Record<string, boolean>;
  } {
    return {
      sidebarCollapsed: readFlag(REPORTS_SIDEBAR_COLLAPSED_KEY),
      folderExpandedState: readBooleanRecord(REPORTS_FOLDERS_EXPANDED_KEY),
    };
  }

  persistSidebarCollapsedState(sidebarCollapsed: boolean): void {
    writeFlag(REPORTS_SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
  }

  buildFolderExpandedState(folders: FolderNode[]): Record<string, boolean> {
    const state: Record<string, boolean> = {};
    for (const folder of folders) {
      state[String(folder.id)] = !!folder.expanded;
    }
    return state;
  }

  persistFolderExpandedState(state: Record<string, boolean>): void {
    writeBooleanRecord(REPORTS_FOLDERS_EXPANDED_KEY, state);
  }
}

