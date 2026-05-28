import { firstValueFrom } from 'rxjs';
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
    this.reportService
      .runReportWithParamsAndOptions(reportId, params, {
        safe: false,
        page: nextPage,
        size: this.host.reportPageSize,
      })
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
      const res = await firstValueFrom(this.reportService.runReportAllWithParams(reportId, params, false));
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

    this.host.loadingRun = true;
    this.host.loadingMoreRows = false;
    this.host.loadingAllRows = false;
    this.reportService
      .runReportWithParamsAndOptions(this.host.selectedReportId, params, {
        safe: false,
        page: 0,
        size: this.host.reportPageSize,
      })
      .subscribe({
        next: (res) => {
          this.host.paramsError = '';
          this.host.runResult = res;
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
