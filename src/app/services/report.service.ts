import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EnvStorageService } from './env-storage.service';
import {
  extractAclFlag,
  normalizeCompareResponse,
  normalizeReportColumnsResponse,
  normalizeReportVersion,
  normalizeReportVersionSummaries,
  normalizeVariableOptions,
  normalizeVersionDiscardResponse,
  readNullableNumber,
  readOptionalBoolean,
} from './report.service.normalizers';

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
  canView?: boolean;
  canRun?: boolean;
  createdAt?: number | null;
  updatedAt?: number | null;
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
  secondSql?: string | null;
  comparisonKey?: string | null;
  description: string | null;
  variables: ReportVariable[];
  archived: boolean;
  canView?: boolean;
  canRun?: boolean;
  draft: boolean;
  openDraftVersion: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ReportVersionStatus =
  'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'DISCARDED' | 'REPLACED_DRAFT';
export type ReportVersionAuthorType = 'USER' | 'AI_TOKEN' | 'SYSTEM';

export type ReportVersionSummary = {
  versionNumber: number;
  status: ReportVersionStatus;
  name: string;
  baseVersionNumber: number | null;
  authorType: ReportVersionAuthorType;
  authorName: string;
  note: string | null;
  hasJrxml: boolean;
  createdAt: number;
  updatedAt: number | null;
  publishedAt: number | null;
  publishedBy: string | null;
  /** Contador de gravacoes do rascunho; publicar envia o valor visto para o backend recusar rascunho alterado. */
  revision: number;
};

export type ReportVersion = {
  reportId: string;
  versionNumber: number;
  status: ReportVersionStatus;
  baseVersionNumber: number | null;
  name: string;
  description: string | null;
  folderId: string | null;
  sql: string;
  secondSql: string | null;
  comparisonKey: string | null;
  variables: ReportVariableInput[];
  jasperTemplateId: string | null;
  jrxml: string | null;
  authorType: ReportVersionAuthorType;
  authorName: string;
  note: string | null;
  createdAt: number;
  updatedAt: number | null;
  publishedAt: number | null;
  publishedBy: string | null;
  /** Contador de gravacoes do rascunho; publicar envia o valor visto para o backend recusar rascunho alterado. */
  revision: number;
};

export type ReportVersionRunRequest = {
  params?: Record<string, unknown> | null;
  page?: number;
  size?: number;
};

export type ReportVersionDiscardResponse = {
  reportDeleted: boolean;
};

export type ReportCreateInput = {
  name: string;
  folderId: string;
  templateName?: string;
  jasperTemplateId?: string | null;
  sql: string;
  secondSql?: string | null;
  comparisonKey?: string | null;
  description: string | null;
  variables: ReportVariableInput[];
  archived?: boolean;
};

export type ReportCompareSource = {
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

export type ReportCompareDiffFieldDetail = {
  source1: unknown;
  source2: unknown;
  equal: boolean;
  diff: number | null;
};

export type ReportCompareDiffRow = {
  key: string | null;
  fields: Record<string, ReportCompareDiffFieldDetail>;
  source1Row?: Record<string, unknown> | null;
  source2Row?: Record<string, unknown> | null;
};

export type ReportCompareDiff = {
  onlyInSource1: Record<string, unknown>[];
  onlyInSource2: Record<string, unknown>[];
  matchCount: number;
  equalCount: number;
  differentCount: number;
  withDifferences: ReportCompareDiffRow[];
};

export type ReportCompareMode = 'keyed' | 'content';

export type ReportCompareDuplicateKey = {
  key: string;
  count: number;
};

export type ReportCompareResponse = {
  name: string;
  mode: ReportCompareMode;
  comparisonKey: string | null;
  source1: ReportCompareSource;
  source2: ReportCompareSource;
  duplicateKeysSource1: ReportCompareDuplicateKey[];
  duplicateKeysSource2: ReportCompareDuplicateKey[];
  diff: ReportCompareDiff | null;
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
    page: number;
    size: number;
    rowCount: number;
    elapsedMs: number;
    truncated: boolean;
  };
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summaries: ReportRunSummary[];
};

export type ReportRunRequestOptions = {
  safe?: boolean;
  page?: number;
  size?: number;
};

export type ReportCompareRequest = {
  params?: Record<string, unknown>;
  comparisonTolerances?: Record<string, number>;
};

export type ReportColumnsSource = 'primary' | 'secondary' | 'both';

export type ReportColumnsResponse = {
  reportId: string;
  primaryColumns: string[];
  secondaryColumns: string[];
  mergedColumns: string[];
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

export type ReportConnectionSource = 'agromobi' | 'sap';

export type ReportConnectionTestResponse = {
  ok?: boolean;
  source?: ReportConnectionSource | string;
  message?: string;
  elapsedMs?: number;
};

export type AiToken = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
  active: boolean;
  expired: boolean;
};

export type AiTokenCreateInput = {
  name: string;
  validityDays?: number;
};

export type AiTokenCreated = {
  id: string;
  name: string;
  token: string;
  expiresAt: number;
  warning: string;
};

export type AiApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export type AiApproval = {
  id: string;
  status: AiApprovalStatus;
  sql: string;
  motivo: string;
  linhasPedidas: number;
  linhasAprovadas: number | null;
  custoEstimado: number | null;
  token: string;
  solicitadoPor: string;
  decididoPor: string | null;
  decididoEm: number | null;
  nota: string | null;
  expiraEm: number | null;
  criadoEm: number;
  vigente: boolean;
};

export type AiApprovalDecision = {
  linhas?: number;
  minutos?: number;
  nota?: string | null;
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
    return this.http.post<ReportRunResponse>(
      `${this.base}/reports/${encodeURIComponent(id)}/run`,
      {},
    );
  }

  runReportWithParams(
    id: string,
    params?: Record<string, unknown> | null,
  ): Observable<ReportRunResponse> {
    const body = params && Object.keys(params).length ? { params } : null;
    return this.http.post<ReportRunResponse>(
      `${this.base}/reports/${encodeURIComponent(id)}/run`,
      body,
    );
  }

  runReportWithParamsAndOptions(
    id: string,
    params?: Record<string, unknown> | null,
    options?: ReportRunRequestOptions,
  ): Observable<ReportRunResponse> {
    const body: Record<string, unknown> = {};
    if (params && Object.keys(params).length) body['params'] = params;
    if (options?.safe !== undefined) body['safe'] = options.safe;
    if (options?.page !== undefined) body['page'] = options.page;
    if (options?.size !== undefined) body['size'] = options.size;
    return this.http.post<ReportRunResponse>(
      `${this.base}/reports/${encodeURIComponent(id)}/run`,
      body,
    );
  }

  compareReport(
    id: string,
    request?: ReportCompareRequest | null,
  ): Observable<ReportCompareResponse> {
    const body: Record<string, unknown> = {};
    if (request?.params && Object.keys(request.params).length) body['params'] = request.params;
    if (request?.comparisonTolerances && Object.keys(request.comparisonTolerances).length) {
      body['comparisonTolerances'] = request.comparisonTolerances;
    }
    return this.http
      .post<any>(`${this.base}/reports/${encodeURIComponent(id)}/compare`, body)
      .pipe(map((res) => normalizeCompareResponse(res) as ReportCompareResponse));
  }

  getReportColumns(
    id: string,
    source: ReportColumnsSource = 'both',
  ): Observable<ReportColumnsResponse> {
    return this.http
      .get<any>(`${this.base}/reports/${encodeURIComponent(id)}/columns`, {
        params: { source },
      })
      .pipe(map((res) => normalizeReportColumnsResponse(id, res) as ReportColumnsResponse));
  }

  runReportAllWithParams(
    id: string,
    params?: Record<string, unknown> | null,
    safe?: boolean,
  ): Observable<ReportRunResponse> {
    const body: Record<string, unknown> = {};
    if (params && Object.keys(params).length) body['params'] = params;
    if (safe !== undefined) body['safe'] = safe;
    return this.http.post<ReportRunResponse>(
      `${this.base}/reports/${encodeURIComponent(id)}/run/all`,
      body,
    );
  }

  listVariableOptions(
    reportId: string,
    key: string,
    params?: Record<string, unknown> | null,
    limit = 100,
  ): Observable<ReportVariableOption[]> {
    const body: Record<string, unknown> = { limit };
    if (params && Object.keys(params).length) body['params'] = params;
    return this.http
      .post<any>(
        `${this.base}/reports/${encodeURIComponent(reportId)}/variables/${encodeURIComponent(key)}/options`,
        body,
      )
      .pipe(map((res) => normalizeVariableOptions(res) as ReportVariableOption[]));
  }

  generateReportPdf(
    id: string,
    params?: Record<string, unknown> | null,
    safe?: boolean,
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

  testAgromobiConnection(): Observable<ReportValidationResponse> {
    return this.validateReportQuery({
      sql: 'SELECT 1 AS ok',
      variables: [],
      validateSyntax: true,
      enforceRequired: false,
      enforceReadOnly: true,
    });
  }

  testSapConnection(): Observable<ReportConnectionTestResponse> {
    return this.http.post<ReportConnectionTestResponse>(`${this.base}/reports/connection-test`, {
      source: 'sap',
      sql: 'SELECT 1 AS "ok" FROM DUMMY',
    });
  }

  listReportVersions(reportId: string): Observable<ReportVersionSummary[]> {
    return this.http
      .get<unknown>(this.versionsUrl(reportId))
      .pipe(map((res) => normalizeReportVersionSummaries(res)));
  }

  getReportVersion(reportId: string, versionNumber: number): Observable<ReportVersion> {
    return this.http
      .get<unknown>(this.versionsUrl(reportId, versionNumber))
      .pipe(map((res) => this.normalizeVersion(res)));
  }

  runReportVersion(
    reportId: string,
    versionNumber: number,
    request?: ReportVersionRunRequest | null,
  ): Observable<ReportRunResponse> {
    const body: Record<string, unknown> = {};
    if (request?.params && Object.keys(request.params).length) body['params'] = request.params;
    if (request?.page !== undefined) body['page'] = request.page;
    if (request?.size !== undefined) body['size'] = request.size;
    return this.http.post<ReportRunResponse>(
      `${this.versionsUrl(reportId, versionNumber)}/run`,
      body,
    );
  }

  generateReportVersionPdf(
    reportId: string,
    versionNumber: number,
    params?: Record<string, unknown> | null,
  ): Observable<Blob> {
    const body: Record<string, unknown> = {};
    if (params && Object.keys(params).length) body['params'] = params;
    return this.http.post(`${this.versionsUrl(reportId, versionNumber)}/pdf`, body, {
      responseType: 'blob',
    });
  }

  /** `expectedRevision` e a revisao do conteudo revisado; o backend devolve 409 se o rascunho mudou. */
  publishReportVersion(
    reportId: string,
    versionNumber: number,
    expectedRevision: number,
    note?: string | null,
  ): Observable<ReportVersion> {
    return this.http
      .post<unknown>(`${this.versionsUrl(reportId, versionNumber)}/publish`, {
        ...this.versionNoteBody(note),
        expectedRevision,
      })
      .pipe(map((res) => this.normalizeVersion(res)));
  }

  discardReportVersion(
    reportId: string,
    versionNumber: number,
  ): Observable<ReportVersionDiscardResponse> {
    return this.http
      .post<unknown>(`${this.versionsUrl(reportId, versionNumber)}/discard`, {})
      .pipe(map((res) => normalizeVersionDiscardResponse(res)));
  }

  restoreReportVersion(
    reportId: string,
    versionNumber: number,
    note?: string | null,
  ): Observable<ReportVersion> {
    return this.http
      .post<unknown>(
        `${this.versionsUrl(reportId, versionNumber)}/restore`,
        this.versionNoteBody(note),
      )
      .pipe(map((res) => this.normalizeVersion(res)));
  }

  /** Cria um rascunho novo com o conteudo da versao n. Nao publica nada. */
  reuseReportVersion(
    reportId: string,
    versionNumber: number,
    note?: string | null,
  ): Observable<ReportVersion> {
    return this.http
      .post<unknown>(
        `${this.versionsUrl(reportId, versionNumber)}/reuse`,
        this.versionNoteBody(note),
      )
      .pipe(map((res) => this.normalizeVersion(res)));
  }

  /** Base absoluta do backend (a mesma usada nas chamadas), para montar comandos externos. */
  apiBaseUrl(): string {
    const base = this.base.replace(/\/+$/, '');
    try {
      return new URL(base, window.location.origin).toString().replace(/\/+$/, '');
    } catch {
      return base;
    }
  }

  listAiTokens(): Observable<AiToken[]> {
    return this.http.get<AiToken[]>(`${this.base}/ai/tokens`);
  }

  createAiToken(input: AiTokenCreateInput): Observable<AiTokenCreated> {
    const body: AiTokenCreateInput = { name: input.name.trim() };
    if (input.validityDays !== undefined) body.validityDays = input.validityDays;
    return this.http.post<AiTokenCreated>(`${this.base}/ai/tokens`, body);
  }

  revokeAiToken(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/ai/tokens/${encodeURIComponent(id)}`);
  }

  listAiApprovals(status?: AiApprovalStatus | null): Observable<AiApproval[]> {
    const options = status ? { params: { status } } : {};
    return this.http.get<AiApproval[]>(`${this.base}/ai-approvals`, options);
  }

  getAiApprovalsPendingCount(): Observable<number> {
    return this.http
      .get<{ pending?: number }>(`${this.base}/ai-approvals/pending-count`)
      .pipe(map((res) => Number(res?.pending ?? 0) || 0));
  }

  approveAiApproval(id: string, decision: AiApprovalDecision): Observable<AiApproval> {
    const body: Record<string, unknown> = {};
    if (decision.linhas !== undefined) body['linhas'] = decision.linhas;
    if (decision.minutos !== undefined) body['minutos'] = decision.minutos;
    const nota = String(decision.nota ?? '').trim();
    if (nota) body['nota'] = nota;
    return this.http.post<AiApproval>(
      `${this.base}/ai-approvals/${encodeURIComponent(id)}/approve`,
      body,
    );
  }

  denyAiApproval(id: string, nota?: string | null): Observable<AiApproval> {
    const trimmed = String(nota ?? '').trim();
    return this.http.post<AiApproval>(
      `${this.base}/ai-approvals/${encodeURIComponent(id)}/deny`,
      trimmed ? { nota: trimmed } : {},
    );
  }

  downloadAiPackage(): Observable<Blob> {
    return this.http.get(`${this.base}/ai/pacote`, { responseType: 'blob' });
  }

  getAiInstructions(): Observable<string> {
    return this.http.get(`${this.base}/ai/instrucoes`, { responseType: 'text' });
  }

  listFolderAcl(folderId: string): Observable<AccessControlRule[]> {
    return this.http
      .get<any>(`${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`)
      .pipe(map((res) => this.normalizeAclRules(res)));
  }

  upsertFolderAcl(
    folderId: string,
    payload: AccessControlRuleInput,
  ): Observable<AccessControlRule> {
    return this.http
      .put<any>(`${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`, payload)
      .pipe(map((res) => this.normalizeAclRule(res)));
  }

  deleteFolderAcl(
    folderId: string,
    subjectType: AclSubjectType,
    subject: string,
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.adminBase}/report-folders/${encodeURIComponent(folderId)}/acl`,
      {
        params: {
          subjectType,
          subject,
        },
      },
    );
  }

  listReportAcl(reportId: string): Observable<AccessControlRule[]> {
    return this.http
      .get<any>(`${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`)
      .pipe(map((res) => this.normalizeAclRules(res)));
  }

  upsertReportAcl(
    reportId: string,
    payload: AccessControlRuleInput,
  ): Observable<AccessControlRule> {
    return this.http
      .put<any>(`${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`, payload)
      .pipe(map((res) => this.normalizeAclRule(res)));
  }

  deleteReportAcl(
    reportId: string,
    subjectType: AclSubjectType,
    subject: string,
  ): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/reports/${encodeURIComponent(reportId)}/acl`, {
      params: {
        subjectType,
        subject,
      },
    });
  }

  private normalizeFolders(res: any): ReportFolder[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeFolder(item))
      .filter((item: ReportFolder | null): item is ReportFolder => !!item);
  }

  private normalizeFolder(item: any): ReportFolder {
    const canView = extractAclFlag(item, 'view');
    const canRun = extractAclFlag(item, 'run');
    return {
      id: String(item?.id ?? item?.folderId ?? item?.folder_id ?? ''),
      name: String(item?.name ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      archived: Boolean(item?.archived),
      ...(canView === undefined ? {} : { canView }),
      ...(canRun === undefined ? {} : { canRun }),
      createdAt:
        item?.createdAt !== undefined || item?.created_at !== undefined
          ? Number(item?.createdAt ?? item?.created_at ?? 0)
          : null,
      updatedAt:
        item?.updatedAt !== undefined || item?.updated_at !== undefined
          ? Number(item?.updatedAt ?? item?.updated_at ?? 0)
          : null,
    };
  }

  private normalizeReports(res: any): ReportDefinition[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeReport(item))
      .filter((item: ReportDefinition | null): item is ReportDefinition => !!item);
  }

  private normalizeReport(item: any): ReportDefinition {
    const canView = extractAclFlag(item, 'view');
    const canRun = extractAclFlag(item, 'run');
    const jasperTemplate = this.normalizeTemplateSummary(
      item?.jasperTemplate ?? item?.jasper_template,
    );
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
      secondSql: item?.secondSql != null ? String(item.secondSql) : null,
      comparisonKey: item?.comparisonKey != null ? String(item.comparisonKey) : null,
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      variables: Array.isArray(item?.variables)
        ? item.variables.map((v: any) => this.normalizeVariable(v))
        : [],
      archived: Boolean(item?.archived),
      ...(canView === undefined ? {} : { canView }),
      ...(canRun === undefined ? {} : { canRun }),
      draft: readOptionalBoolean(item?.draft) ?? false,
      openDraftVersion: readNullableNumber(item?.openDraftVersion),
      createdAt: Number(item?.createdAt ?? item?.created_at ?? 0),
      updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0),
    };
  }

  private versionsUrl(reportId: string, versionNumber?: number): string {
    const base = `${this.base}/reports/${encodeURIComponent(reportId)}/versions`;
    return versionNumber === undefined
      ? base
      : `${base}/${encodeURIComponent(String(versionNumber))}`;
  }

  private versionNoteBody(note?: string | null): Record<string, string> {
    const trimmed = String(note ?? '').trim();
    return trimmed ? { note: trimmed } : {};
  }

  private normalizeVersion(res: unknown): ReportVersion {
    return normalizeReportVersion(res, (variable) => this.normalizeVariable(variable));
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
      subjectType: String(
        item?.subjectType ?? item?.subject_type ?? 'ROLE',
      ).toUpperCase() as AclSubjectType,
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
      rawMultiple === true ||
      rawMultiple === 1 ||
      rawMultiple === '1' ||
      String(rawMultiple).toLowerCase() === 'true';

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
