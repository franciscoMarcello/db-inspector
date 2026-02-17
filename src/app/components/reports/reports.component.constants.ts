import { ReportDraft, TemplateDraft } from './reports.component.models';

export const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;

export const REPORT_DRAFT_SQL_KEY = 'dbi.reports.pending_sql';
export const REPORTS_SIDEBAR_COLLAPSED_KEY = 'dbi.reports.sidebar_collapsed';
export const REPORTS_FOLDERS_EXPANDED_KEY = 'dbi.reports.folders_expanded';

export function createEmptyReportDraft(): ReportDraft {
  return {
    id: null,
    name: '',
    sql: '',
    description: '',
    folderId: '',
    jasperTemplateId: '',
  };
}

export function createEmptyTemplateDraft(): TemplateDraft {
  return {
    id: null,
    name: '',
    description: '',
    jrxml: '',
  };
}
