import { ReportFolder, ReportVariableInput } from '../../../services/report.service';

export type FolderNode = ReportFolder & {
  expanded: boolean;
};

export type DraftVariable = ReportVariableInput & {};

export type ReportDraft = {
  id: string | null;
  name: string;
  sql: string;
  description: string;
  folderId: string;
  jasperTemplateId: string;
};

export type TemplateDraft = {
  id: string | null;
  name: string;
  description: string;
  jrxml: string;
};
