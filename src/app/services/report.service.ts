import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EnvStorageService } from './env-storage.service';

export type ReportVariableType = 'string' | 'number' | 'date' | 'datetime' | 'boolean';
export type AclSubjectType = 'USER' | 'ROLE';

export type AccessControlRule = {
  id: string;
  subjectType: AclSubjectType;
  subject: string;
  canView: boolean;
  canRun: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type AccessControlRuleInput = {
  subjectType: AclSubjectType;
  subject: string;
  canView: boolean;
  canRun: boolean;
  canEdit: boolean;
  canDelete: boolean;
};
export type JasperTemplateInput = {
  name: string;
  description: string | null;
  jrxml: string;
  archived?: boolean;
};

export type JasperTemplateSummary = {
  id: string;
  name: string;
  archived: boolean;
};

export type JasperTemplateResponse = JasperTemplateInput & {
  id: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ReportFolder = {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
};

export type ReportFolderInput = {
  name: string;
  description: string | null;
  archived?: boolean;
};

export type ReportVariable = {
  id?: string;
  key: string;
  label: string;
  type: ReportVariableType;
  required: boolean;
  multiple: boolean;
  defaultValue: string | null;
  orderIndex: number;
  optionsSql?: string | null;
};

export type ReportVariableInput = Omit<ReportVariable, 'id'> & {
  id?: string;
};

export type ReportDefinition = {
  id: string;
  name: string;
  folderId?: string | null;
  folderName?: string;
  templateName?: string;
  jasperTemplateId?: string | null;
  jasperTemplate?: JasperTemplateSummary | null;
  sql: string;
  description: string | null;
  variables: ReportVariable[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ReportCreateInput = {
  name: string;
  folderId: string;
  templateName?: string;
  jasperTemplateId?: string | null;
  sql: string;
  description: string | null;
  variables: ReportVariableInput[];
  archived?: boolean;
};

export type ReportRunSummary = {
  column: string;
  sum: number;
};

export type ReportRunResponse = {
  name: string;
  meta: {
    environment: string;
    generatedAt: string;
    lastRunAt: string;
    rowCount: number;
    elapsedMs: number;
    truncated: boolean;
  };
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summaries: ReportRunSummary[];
};

export type ReportVariableOption = {
  valor: string | number | boolean | null;
  descricao: string;
};

export type ReportValidationRequest = {
  sql: string;
  variables: ReportVariableInput[];
  params?: Record<string, unknown>;
  validateSyntax?: boolean;
  enforceRequired?: boolean;
  enforceReadOnly?: boolean;
};

export type ReportValidationResponse = {
  valid: boolean;
  errors: string[];
  renderedQuery?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private get base(): string {
    return this.env.getActive()?.backend || '/api/db';
  }

  private get adminBase(): string {
    const backend = this.env.getActive()?.backend || '/api/db';
    return backend.replace(/\/api\/db\/?$/i, '/api/admin');
  }

  listFolders(): Observable<ReportFolder[]> {
    return this.http
      .get<any>(`${this.base}/report-folders`)
      .pipe(map((res) => this.normalizeFolders(res)));
  }

  createFolder(payload: ReportFolderInput): Observable<ReportFolder> {
    return this.http
      .post<any>(`${this.base}/report-folders`, payload)
      .pipe(map((res) => this.normalizeFolder(res)));
  }

  updateFolder(id: string, payload: ReportFolderInput): Observable<ReportFolder> {
    return this.http
      .put<any>(`${this.base}/report-folders/${encodeURIComponent(id)}`, payload)
      .pipe(map((res) => this.normalizeFolder(res)));
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/report-folders/${encodeURIComponent(id)}`);
  }

  listTemplates(): Observable<JasperTemplateResponse[]> {
    return this.http
      .get<any>(`${this.base}/report-templates`)
      .pipe(map((res) => this.normalizeTemplates(res)));
  }

  getTemplate(id: string): Observable<JasperTemplateResponse> {
    return this.http
      .get<any>(`${this.base}/report-templates/${encodeURIComponent(id)}`)
      .pipe(map((res) => this.normalizeTemplate(res)));
  }

  createTemplate(payload: JasperTemplateInput): Observable<JasperTemplateResponse> {
    return this.http
      .post<any>(`${this.base}/report-templates`, payload)
      .pipe(map((res) => this.normalizeTemplate(res)));
  }

  updateTemplate(id: string, payload: JasperTemplateInput): Observable<JasperTemplateResponse> {
    return this.http
      .put<any>(`${this.base}/report-templates/${encodeURIComponent(id)}`, payload)
      .pipe(map((res) => this.normalizeTemplate(res)));
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/report-templates/${encodeURIComponent(id)}`);
  }

  listReports(): Observable<ReportDefinition[]> {
    return this.http
      .get<any>(`${this.base}/reports`)
      .pipe(map((res) => this.normalizeReports(res)));
  }

  createReport(payload: ReportCreateInput): Observable<ReportDefinition> {
    const variables = (payload.variables || []).map((variable) => this.toVariablePayload(variable));
    return this.http
      .post<any>(`${this.base}/reports`, {
        ...payload,
        variables,
        folder_id: payload.folderId,
      })
      .pipe(map((res) => this.normalizeReport(res)));
  }

  updateReport(id: string, payload: ReportCreateInput): Observable<ReportDefinition> {
    const variables = (payload.variables || []).map((variable) => this.toVariablePayload(variable));
    return this.http
      .put<any>(`${this.base}/reports/${encodeURIComponent(id)}`, {
        ...payload,
        variables,
        folder_id: payload.folderId,
      })
      .pipe(map((res) => this.normalizeReport(res)));
  }

  deleteReport(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/reports/${encodeURIComponent(id)}`);
  }

  runReport(id: string): Observable<ReportRunResponse> {
    return this.http.post<ReportRunResponse>(`${this.base}/reports/${encodeURIComponent(id)}/run`, {});
  }

  runReportWithParams(
    id: string,
    params?: Record<string, unknown> | null
  ): Observable<ReportRunResponse> {
    const body = params && Object.keys(params).length ? { params } : null;
    return this.http.post<ReportRunResponse>(`${this.base}/reports/${encodeURIComponent(id)}/run`, body);
  }

  listVariableOptions(
    reportId: string,
    key: string,
    params?: Record<string, unknown> | null,
    limit = 100
  ): Observable<ReportVariableOption[]> {
    const body: Record<string, unknown> = { limit };
    if (params && Object.keys(params).length) body['params'] = params;
    return this.http
      .post<any>(
        `${this.base}/reports/${encodeURIComponent(reportId)}/variables/${encodeURIComponent(key)}/options`,
        body
      )
      .pipe(map((res) => this.normalizeVariableOptions(res)));
  }

  generateReportPdf(
    id: string,
    params?: Record<string, unknown> | null,
    safe?: boolean
  ): Observable<Blob> {
    const body: Record<string, unknown> = {};
    if (params && Object.keys(params).length) body['params'] = params;
    if (safe !== undefined) body['safe'] = safe;
    return this.http.post(`${this.base}/reports/${encodeURIComponent(id)}/pdf`, body, {
      responseType: 'blob',
    });
  }

  validateReportQuery(payload: ReportValidationRequest): Observable<ReportValidationResponse> {
    return this.http.post<ReportValidationResponse>(`${this.base}/reports/validate`, payload);
  }

  listFolderAcl(folderId: string): Observable<AccessControlRule[]> {
    return this.http
      .get<any>(`${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`)
      .pipe(map((res) => this.normalizeAclRules(res)));
  }

  upsertFolderAcl(folderId: string, payload: AccessControlRuleInput): Observable<AccessControlRule> {
    return this.http
      .put<any>(`${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`, payload)
      .pipe(map((res) => this.normalizeAclRule(res)));
  }

  deleteFolderAcl(folderId: string, subjectType: AclSubjectType, subject: string): Observable<void> {
    return this.http.delete<void>(
      `${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`,
      {
        params: {
          subjectType,
          subject,
        },
      }
    );
  }

  listReportAcl(reportId: string): Observable<AccessControlRule[]> {
    return this.http
      .get<any>(`${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`)
      .pipe(map((res) => this.normalizeAclRules(res)));
  }

  upsertReportAcl(reportId: string, payload: AccessControlRuleInput): Observable<AccessControlRule> {
    return this.http
      .put<any>(`${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`, payload)
      .pipe(map((res) => this.normalizeAclRule(res)));
  }

  deleteReportAcl(reportId: string, subjectType: AclSubjectType, subject: string): Observable<void> {
    return this.http.delete<void>(
      `${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`,
      {
        params: {
          subjectType,
          subject,
        },
      }
    );
  }

  private normalizeFolders(res: any): ReportFolder[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeFolder(item))
      .filter((item: ReportFolder | null): item is ReportFolder => !!item);
  }

  private normalizeFolder(item: any): ReportFolder {
    return {
      id: String(item?.id ?? item?.folderId ?? item?.folder_id ?? ''),
      name: String(item?.name ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      archived: Boolean(item?.archived),
    };
  }

  private normalizeReports(res: any): ReportDefinition[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeReport(item))
      .filter((item: ReportDefinition | null): item is ReportDefinition => !!item);
  }

  private normalizeReport(item: any): ReportDefinition {
    const jasperTemplate = this.normalizeTemplateSummary(item?.jasperTemplate ?? item?.jasper_template);
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name ?? ''),
      folderId: this.extractFolderId(item),
      folderName: this.extractFolderName(item),
      templateName:
        item?.templateName !== undefined
          ? String(item.templateName ?? '')
          : item?.template_name !== undefined
          ? String(item.template_name ?? '')
          : undefined,
      jasperTemplateId: this.extractJasperTemplateId(item),
      jasperTemplate,
      sql: String(item?.sql ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      variables: Array.isArray(item?.variables)
        ? item.variables.map((v: any) => this.normalizeVariable(v))
        : [],
      archived: Boolean(item?.archived),
      createdAt: Number(item?.createdAt ?? item?.created_at ?? 0),
      updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0),
    };
  }

  private normalizeTemplates(res: any): JasperTemplateResponse[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeTemplate(item))
      .filter((item: JasperTemplateResponse | null): item is JasperTemplateResponse => !!item);
  }

  private normalizeTemplate(item: any): JasperTemplateResponse {
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      jrxml: String(item?.jrxml ?? ''),
      archived: Boolean(item?.archived),
      createdAt: Number(item?.createdAt ?? item?.created_at ?? 0),
      updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0),
    };
  }

  private normalizeTemplateSummary(item: any): JasperTemplateSummary | null {
    if (!item) return null;
    const id = String(item?.id ?? '');
    if (!id) return null;
    return {
      id,
      name: String(item?.name ?? ''),
      archived: Boolean(item?.archived),
    };
  }

  private normalizeAclRules(res: any): AccessControlRule[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeAclRule(item))
      .filter((item: AccessControlRule | null): item is AccessControlRule => !!item);
  }

  private normalizeAclRule(item: any): AccessControlRule {
    return {
      id: String(item?.id ?? ''),
      subjectType: String(item?.subjectType ?? item?.subject_type ?? 'ROLE').toUpperCase() as AclSubjectType,
      subject: String(item?.subject ?? ''),
      canView: Boolean(item?.canView ?? item?.can_view),
      canRun: Boolean(item?.canRun ?? item?.can_run),
      canEdit: Boolean(item?.canEdit ?? item?.can_edit),
      canDelete: Boolean(item?.canDelete ?? item?.can_delete),
    };
  }

  private normalizeVariable(item: any): ReportVariable {
    const rawOptionsSql =
      item?.optionsSql ??
      item?.options_sql ??
      item?.optionSql ??
      item?.option_sql ??
      item?.optionsQuery ??
      item?.options_query ??
      item?.sqlOptions ??
      item?.sql_options ??
      null;
    const optionsSql =
      rawOptionsSql === null || rawOptionsSql === undefined
        ? null
        : String(rawOptionsSql).trim() || null;

    const rawMultiple = item?.multiple ?? item?.isMultiple ?? item?.is_multiple ?? false;
    const multiple =
      rawMultiple === true || rawMultiple === 1 || rawMultiple === '1' || String(rawMultiple).toLowerCase() === 'true';

    return {
      id: item?.id ? String(item.id) : undefined,
      key: String(item?.key ?? ''),
      label: String(item?.label ?? item?.key ?? ''),
      type: this.normalizeVariableType(item?.type),
      required: Boolean(item?.required),
      multiple,
      defaultValue:
        item?.defaultValue === null || item?.defaultValue === undefined
          ? null
          : String(item.defaultValue),
      orderIndex: Number(item?.orderIndex ?? 0),
      optionsSql,
    };
  }

  private normalizeVariableOptions(res: any): ReportVariableOption[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data.map((item: any) => ({
      valor:
        item?.valor === undefined
          ? item?.value === undefined
            ? null
            : item.value
          : item.valor,
      descricao: String(item?.descricao ?? item?.description ?? item?.label ?? item?.valor ?? ''),
    }));
  }

  private normalizeVariableType(value: any): ReportVariableType {
    const t = String(value ?? 'string').toLowerCase();
    if (t === 'number' || t === 'date' || t === 'datetime' || t === 'boolean') return t;
    return 'string';
  }

  private extractFolderId(item: any): string | null {
    const raw =
      item?.folderId ??
      item?.folder_id ??
      item?.reportFolderId ??
      item?.report_folder_id ??
      item?.folder?.id ??
      null;
    if (raw === null || raw === undefined || raw === '') return null;
    return String(raw);
  }

  private extractFolderName(item: any): string | undefined {
    const raw =
      item?.folderName ??
      item?.folder_name ??
      item?.reportFolderName ??
      item?.report_folder_name ??
      item?.folder?.name ??
      undefined;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return String(raw);
  }

  private extractJasperTemplateId(item: any): string | null {
    const raw =
      item?.jasperTemplateId ??
      item?.jasper_template_id ??
      item?.jasperTemplate?.id ??
      item?.jasper_template?.id ??
      null;
    if (raw === null || raw === undefined || raw === '') return null;
    return String(raw);
  }

  private toVariablePayload(variable: ReportVariableInput): Record<string, unknown> {
    const optionsSql =
      variable.optionsSql === undefined || variable.optionsSql === null
        ? null
        : String(variable.optionsSql).trim() || null;

    return {
      ...variable,
      multiple: Boolean(variable.multiple),
      isMultiple: Boolean(variable.multiple),
      is_multiple: Boolean(variable.multiple),
      optionsSql,
      options_sql: optionsSql,
      optionsQuery: optionsSql,
      options_query: optionsSql,
    };
  }
}
