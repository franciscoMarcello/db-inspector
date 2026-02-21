import { JasperTemplateResponse, ReportFolder, ReportService, ReportValidationResponse } from '../../../services/report.service';
import { DbInspectorService } from '../../../services/db-inspector.service';
import { DraftVariable, FolderNode, ReportDraft } from './reports.component.models';
import {
  buildReportValidationParams,
  toReportCreatePayload,
  toReportVariablesPayload,
  validateReportDraft,
} from './reports.component.utils';

export interface ReportsDraftHost {
  folders: FolderNode[];
  selectedFolderId: string | null;
  reportDraft: ReportDraft;
  reportDraftVariables: DraftVariable[];
  reportDraftError: string;
  reportModalMode: 'create' | 'edit';
  reportModalOpen: boolean;
  statusMessage: string;
  reportValidationInputs: Record<string, string>;
  reportValidationResult: ReportValidationResponse | null;
  reportValidationError: string;
  validatingReportDraft: boolean;
  reportDraftPreviewRows: Record<string, unknown>[];
  reportDraftPreviewColumns: string[];
  reportDraftPreviewError: string;
  loadingReportDraftPreview: boolean;
  resolveRequestError(error: unknown, fallback: string): string;
  reloadReports(preferredReportId?: string, preferredFolderId?: string): void;
}

export class ReportsDraftLogic {
  constructor(
    private readonly host: ReportsDraftHost,
    private readonly reportService: ReportService,
    private readonly dbService: DbInspectorService
  ) {}

  saveReportFromModal() {
    const folder = this.host.folders.find((item) => item.id === this.host.reportDraft.folderId);
    const validation = validateReportDraft(this.host.reportDraft, Boolean(folder));
    if (validation.error) {
      this.host.reportDraftError = validation.error;
      return;
    }
    if (!folder) return;

    const variables = toReportVariablesPayload(this.host.reportDraftVariables);
    const payload = toReportCreatePayload(this.host.reportDraft, folder, variables);

    if (this.host.reportModalMode === 'create') {
      this.reportService.createReport(payload).subscribe({
        next: (created) => {
          this.host.statusMessage = `Relatorio "${created.name}" criado.`;
          this.host.reportModalOpen = false;
          this.host.reloadReports(created.id, folder.id);
        },
        error: (err) => {
          this.host.reportDraftError = this.host.resolveRequestError(err, 'Falha ao criar relatorio.');
        },
      });
      return;
    }

    if (!this.host.reportDraft.id) {
      this.host.reportDraftError = 'Relatório inválido para atualização.';
      return;
    }

    this.reportService.updateReport(this.host.reportDraft.id, payload).subscribe({
      next: (updated) => {
        this.host.statusMessage = `Relatorio "${updated.name}" atualizado.`;
        this.host.reportModalOpen = false;
        const nextFolder = updated.folderId ?? this.host.selectedFolderId;
        this.host.reloadReports(updated.id, nextFolder ?? undefined);
      },
      error: (err) => {
        this.host.reportDraftError = this.host.resolveRequestError(err, 'Falha ao atualizar relatorio.');
      },
    });
  }

  validateReportDraftQuery(onDone?: (result: ReportValidationResponse | null) => void) {
    const sql = this.host.reportDraft.sql.trim();
    if (!sql) {
      this.host.reportValidationError = 'Informe a SQL antes de validar.';
      this.host.reportValidationResult = null;
      onDone?.(null);
      return;
    }

    const variables = toReportVariablesPayload(this.host.reportDraftVariables);
    const validationParams = buildReportValidationParams(variables, this.host.reportValidationInputs);
    if (validationParams.error) {
      this.host.reportValidationError = validationParams.error;
      this.host.reportValidationResult = null;
      onDone?.(null);
      return;
    }

    this.host.validatingReportDraft = true;
    this.host.reportValidationError = '';
    this.host.reportValidationResult = null;
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
          this.host.validatingReportDraft = false;
          this.host.reportValidationResult = result;
          if (result?.valid === false && (!result.errors || !result.errors.length)) {
            this.host.reportValidationError = 'Consulta inválida.';
          }
          onDone?.(result);
        },
        error: (err) => {
          this.host.validatingReportDraft = false;
          this.host.reportValidationError = this.host.resolveRequestError(err, 'Falha ao validar consulta.');
          onDone?.(null);
        },
      });
  }

  saveAndTestReportFromModal() {
    this.validateReportDraftQuery((result) => {
      if (!result?.valid) {
        this.host.reportDraftError = 'Corrija a consulta antes de salvar.';
        return;
      }
      this.saveReportFromModal();
    });
  }

  executeReportDraftPreview() {
    const sql = this.host.reportDraft.sql.trim();
    if (!sql) {
      this.host.reportDraftPreviewError = 'Informe a SQL antes de executar teste.';
      this.host.reportDraftPreviewRows = [];
      this.host.reportDraftPreviewColumns = [];
      return;
    }

    const variables = toReportVariablesPayload(this.host.reportDraftVariables);
    const validationParams = buildReportValidationParams(variables, this.host.reportValidationInputs);
    if (validationParams.error) {
      this.host.reportDraftPreviewError = validationParams.error;
      this.host.reportDraftPreviewRows = [];
      this.host.reportDraftPreviewColumns = [];
      return;
    }

    this.host.loadingReportDraftPreview = true;
    this.host.reportDraftPreviewError = '';
    this.host.reportDraftPreviewRows = [];
    this.host.reportDraftPreviewColumns = [];

    this.reportService
      .validateReportQuery({
        sql,
        variables,
        params: validationParams.params,
        validateSyntax: true,
        enforceRequired: true,
        enforceReadOnly: true,
      })
      .subscribe({
        next: (validation) => {
          if (!validation.valid || !validation.renderedQuery) {
            this.host.loadingReportDraftPreview = false;
            this.host.reportDraftPreviewError = validation.errors?.[0] || 'Consulta inválida para preview.';
            return;
          }

          this.dbService.runQuery(validation.renderedQuery, 0, 5).subscribe({
            next: (res) => {
              this.host.loadingReportDraftPreview = false;
              const rows = Array.isArray(res?.data)
                ? res.data
                : Array.isArray(res?.rows)
                  ? res.rows
                  : Array.isArray(res)
                    ? res
                    : [];
              this.host.reportDraftPreviewRows = rows.slice(0, 5);
              this.host.reportDraftPreviewColumns = this.host.reportDraftPreviewRows.length
                ? Object.keys(this.host.reportDraftPreviewRows[0] || {})
                : [];
            },
            error: (err) => {
              this.host.loadingReportDraftPreview = false;
              this.host.reportDraftPreviewError = this.host.resolveRequestError(
                err,
                'Falha ao executar preview.'
              );
            },
          });
        },
        error: (err) => {
          this.host.loadingReportDraftPreview = false;
          this.host.reportDraftPreviewError = this.host.resolveRequestError(
            err,
            'Falha ao validar consulta para preview.'
          );
        },
      });
  }
}

