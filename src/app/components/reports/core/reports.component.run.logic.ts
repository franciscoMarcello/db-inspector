import { Observable, firstValueFrom } from 'rxjs';
import { ReportRunResponse, ReportService } from '../../../services/report.service';

export interface ReportsRunHost {
  selectedReportId: string | null;
  runResult: ReportRunResponse | null;
  loadingRun: boolean;
  loadingMoreRows: boolean;
  loadingAllRows: boolean;
  paramsError: string;
  statusMessage: string;
  reportPageSize: number;
  lastRunParams: Record<string, unknown> | null;
  lastRunReportId: string | null;
  lastLoadedPage: number;
  /** Versao escolhida para testar; null = versao em uso. */
  testVersionNumber: number | null;
  /** Versao que gerou o resultado na tela; null = versao em uso. */
  runResultVersionNumber: number | null;
  canLoadMoreRows: boolean;
  canLoadAllRows: boolean;
  buildRunParams(): Record<string, unknown> | null;
  resolveAclAwareError(error: unknown, fallback: string): string;
  setStatusMessage(message: string, autoClearMs?: number): void;
}

export class ReportsRunLogic {
  constructor(
    private readonly host: ReportsRunHost,
    private readonly reportService: ReportService
  ) {}

  loadMoreResults() {
    if (!this.host.canLoadMoreRows || !this.host.selectedReportId || !this.host.runResult) return;

    const reportId = this.host.selectedReportId;
    const params = this.resolveParamsForPagination(reportId);
    if (params === null) return;

    const nextPage = this.host.lastLoadedPage >= 0 ? this.host.lastLoadedPage + 1 : 1;

    this.host.loadingMoreRows = true;
    this.runPage(reportId, this.host.runResultVersionNumber, params, nextPage)
      .subscribe({
        next: (res) => {
          const merged = this.mergePagedResult(res, nextPage);
          this.host.loadingMoreRows = false;

          if (!merged.madeProgress) {
            this.host.setStatusMessage(
              'Nenhuma nova linha foi carregada. A paginação do backend pode estar retornando páginas repetidas.'
            );
          }
        },
        error: (err) => {
          this.host.loadingMoreRows = false;
          this.host.statusMessage = this.host.resolveAclAwareError(err, 'Falha ao carregar mais resultados.');
        },
      });
  }

  async loadAllResults() {
    if (!this.host.canLoadAllRows || !this.host.selectedReportId || !this.host.runResult) return;

    const reportId = this.host.selectedReportId;
    const params = this.resolveParamsForPagination(reportId);
    if (params === null) return;

    this.host.loadingAllRows = true;
    try {
      this.host.setStatusMessage('Carregando todas as linhas do relatório...');
      const res = await firstValueFrom(this.runAll(reportId, this.host.runResultVersionNumber, params));
      const rows = Array.isArray(res.rows) ? res.rows : [];
      const totalRows = Number(res.meta?.rowCount ?? rows.length);

      this.host.paramsError = '';
      this.host.runResult = {
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
      this.host.lastLoadedPage = 0;
      this.host.setStatusMessage(`Carga completa concluída (${rows.length} linhas).`, 2500);
    } catch (err) {
      this.host.statusMessage = this.host.resolveAclAwareError(err, 'Falha ao carregar todos os resultados.');
    } finally {
      this.host.loadingAllRows = false;
    }
  }

  runSelectedReport() {
    if (!this.host.selectedReportId) {
      this.host.runResult = null;
      this.host.lastRunParams = null;
      this.host.lastRunReportId = null;
      this.host.lastLoadedPage = -1;
      return;
    }

    const params = this.host.buildRunParams();
    if (params === null) {
      this.host.runResult = null;
      this.host.lastRunParams = null;
      this.host.lastRunReportId = null;
      this.host.lastLoadedPage = -1;
      return;
    }

    const versionNumber = this.host.testVersionNumber;
    this.host.loadingRun = true;
    this.host.loadingMoreRows = false;
    this.host.loadingAllRows = false;
    this.runPage(this.host.selectedReportId, versionNumber, params, 0)
      .subscribe({
        next: (res) => {
          this.host.paramsError = '';
          this.host.runResult = res;
          this.host.runResultVersionNumber = versionNumber;
          this.host.lastRunParams = { ...params };
          this.host.lastRunReportId = this.host.selectedReportId;
          this.host.lastLoadedPage = Number.isFinite(Number(res.meta?.page)) ? Number(res.meta?.page) : 0;
          this.host.loadingRun = false;
        },
        error: (err) => {
          this.host.runResult = null;
          this.host.lastRunParams = null;
          this.host.lastRunReportId = null;
          this.host.lastLoadedPage = -1;
          this.host.loadingRun = false;
          this.host.statusMessage = this.host.resolveAclAwareError(err, 'Falha ao executar relatorio.');
        },
      });
  }

  private runPage(
    reportId: string,
    versionNumber: number | null,
    params: Record<string, unknown>,
    page: number,
  ): Observable<ReportRunResponse> {
    const size = this.host.reportPageSize;
    return versionNumber === null
      ? this.reportService.runReportWithParamsAndOptions(reportId, params, { safe: false, page, size })
      : this.reportService.runReportVersion(reportId, versionNumber, { params, page, size });
  }

  private runAll(
    reportId: string,
    versionNumber: number | null,
    params: Record<string, unknown>,
  ): Observable<ReportRunResponse> {
    return versionNumber === null
      ? this.reportService.runReportAllWithParams(reportId, params, false)
      : this.reportService.runReportVersionAll(reportId, versionNumber, params);
  }

  private resolveParamsForPagination(reportId: string): Record<string, unknown> | null {
    if (this.host.lastRunReportId === reportId && this.host.lastRunParams) return this.host.lastRunParams;
    return this.host.buildRunParams();
  }

  private mergePagedResult(
    res: ReportRunResponse,
    page: number
  ): { madeProgress: boolean; done: boolean; total: number; loaded: number } {
    const previousRows = Array.isArray(this.host.runResult?.rows) ? this.host.runResult.rows : [];
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

    this.host.paramsError = '';
    this.host.runResult = {
      ...res,
      columns: res.columns?.length ? res.columns : this.host.runResult?.columns || [],
      rows: mergedRows,
      meta: {
        ...res.meta,
        page,
        rowCount: totalRows > 0 ? totalRows : mergedRows.length,
        size: this.host.reportPageSize,
        truncated,
      },
    };
    this.host.lastLoadedPage = page;

    return {
      madeProgress,
      done: !truncated,
      total: totalRows > 0 ? totalRows : mergedRows.length,
      loaded: mergedRows.length,
    };
  }
}
