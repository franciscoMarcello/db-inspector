import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvStorageService } from './env-storage.service';
import {
  ReportDefinition,
  ReportRunResponse,
  ReportService,
  ReportVersion,
  ReportVersionDiscardResponse,
  ReportVersionSummary,
} from './report.service';

const BASE = '/api/db';

const versionPayload = {
  reportId: 'r1',
  versionNumber: 3,
  status: 'DRAFT',
  baseVersionNumber: 2,
  name: 'Colheita',
  description: null,
  folderId: 'f1',
  sql: 'SELECT 1',
  secondSql: null,
  comparisonKey: null,
  variables: [
    {
      key: 'safra',
      label: 'Safra',
      type: 'NUMBER',
      required: true,
      is_multiple: 'true',
      defaultValue: 2025,
      orderIndex: 0,
      optionsSql: '  ',
    },
  ],
  jasperTemplateId: null,
  jrxml: '<jasperReport/>',
  authorType: 'AI_TOKEN',
  authorName: 'token-ia',
  note: 'criado pela IA',
  createdAt: 1700000000000,
  updatedAt: null,
  publishedAt: null,
  publishedBy: null,
  revision: 1700000000000,
};

describe('ReportService - versoes de relatorio', () => {
  let service: ReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EnvStorageService, useValue: { getActive: () => ({ backend: BASE }) } },
      ],
    });
    service = TestBed.inject(ReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista versoes normalizando status, autor e campos opcionais', () => {
    let result: ReportVersionSummary[] = [];
    service.listReportVersions('r 1').subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r%201/versions`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        versionNumber: 2,
        status: 'published',
        name: 'Colheita',
        baseVersionNumber: 1,
        authorType: 'SYSTEM',
        authorName: 'sistema',
        note: null,
        hasJrxml: true,
        createdAt: 1700000000000,
        updatedAt: null,
        publishedAt: 1700000001000,
        publishedBy: 'ana',
        revision: 1700000000000,
      },
      { versionNumber: 1, status: 'ESTRANHO', authorType: 'OUTRO', hasJrxml: 'false' },
    ]);

    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      versionNumber: 2,
      status: 'PUBLISHED',
      name: 'Colheita',
      baseVersionNumber: 1,
      authorType: 'SYSTEM',
      authorName: 'sistema',
      note: null,
      hasJrxml: true,
      createdAt: 1700000000000,
      updatedAt: null,
      publishedAt: 1700000001000,
      publishedBy: 'ana',
      revision: 1700000000000,
    });
    expect(result[1].status).toBe('DISCARDED');
    expect(result[1].authorType).toBe('USER');
    expect(result[1].hasJrxml).toBeFalse();
    expect(result[1].baseVersionNumber).toBeNull();
  });

  it('aceita lista de versoes embrulhada em data', () => {
    let result: ReportVersionSummary[] = [];
    service.listReportVersions('r1').subscribe((res) => (result = res));
    http.expectOne(`${BASE}/reports/r1/versions`).flush({ data: [{ versionNumber: 4 }] });
    expect(result.map((item) => item.versionNumber)).toEqual([4]);
  });

  it('busca o conteudo completo de uma versao e normaliza as variaveis', () => {
    let result: ReportVersion | null = null;
    service.getReportVersion('r1', 3).subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/3`);
    expect(req.request.method).toBe('GET');
    req.flush(versionPayload);

    const version = result as ReportVersion | null;
    expect(version?.status).toBe('DRAFT');
    expect(version?.authorType).toBe('AI_TOKEN');
    expect(version?.baseVersionNumber).toBe(2);
    expect(version?.jrxml).toBe('<jasperReport/>');
    expect(version?.variables).toEqual([
      jasmine.objectContaining({
        key: 'safra',
        type: 'number',
        multiple: true,
        defaultValue: '2025',
        optionsSql: null,
      }),
    ]);
  });

  it('executa a previa da versao com params, pagina e tamanho', () => {
    let result: ReportRunResponse | null = null;
    service
      .runReportVersion('r1', 3, { params: { safra: 2025 }, page: 0, size: 200 })
      .subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/3/run`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ params: { safra: 2025 }, page: 0, size: 200 });
    req.flush({ name: 'Colheita', columns: ['a'], rows: [{ a: 1 }], meta: { rowCount: 1 } });
    expect((result as ReportRunResponse | null)?.rows).toEqual([{ a: 1 }]);
  });

  it('omite params vazios na previa', () => {
    service.runReportVersion('r1', 3, { params: {} }).subscribe();
    const req = http.expectOne(`${BASE}/reports/r1/versions/3/run`);
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('gera o PDF da versao como blob', () => {
    let result: Blob | null = null;
    service.generateReportVersionPdf('r1', 3, { safra: 2025 }).subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/3/pdf`);
    expect(req.request.method).toBe('POST');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.body).toEqual({ params: { safra: 2025 } });
    req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(result).toEqual(jasmine.any(Blob));
  });

  it('publica a versao enviando a nota sem espacos extras', () => {
    let result: ReportVersion | null = null;
    service
      .publishReportVersion('r1', 3, 1700000000500, '  ajuste de filtro  ')
      .subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/3/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'ajuste de filtro', expectedRevision: 1700000000500 });
    req.flush({ ...versionPayload, status: 'PUBLISHED', publishedBy: 'ana' });
    expect((result as ReportVersion | null)?.status).toBe('PUBLISHED');
  });

  it('publica sem nota enviando so a revisao revisada', () => {
    service.publishReportVersion('r1', 3, 1700000000500, '   ').subscribe();
    const req = http.expectOne(`${BASE}/reports/r1/versions/3/publish`);
    expect(req.request.body).toEqual({ expectedRevision: 1700000000500 });
    req.flush(versionPayload);
  });

  it('descarta o rascunho e informa se o relatorio foi apagado', () => {
    let result: ReportVersionDiscardResponse | null = null;
    service.discardReportVersion('r1', 3).subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/3/discard`);
    expect(req.request.method).toBe('POST');
    req.flush({ reportDeleted: true });
    expect(result as ReportVersionDiscardResponse | null).toEqual({ reportDeleted: true });
  });

  it('trata resposta de descarte sem reportDeleted como false', () => {
    let result: ReportVersionDiscardResponse | null = null;
    service.discardReportVersion('r1', 3).subscribe((res) => (result = res));
    http.expectOne(`${BASE}/reports/r1/versions/3/discard`).flush(null);
    expect(result as ReportVersionDiscardResponse | null).toEqual({ reportDeleted: false });
  });

  it('restaura uma versao substituida com nota', () => {
    let result: ReportVersion | null = null;
    service.restoreReportVersion('r1', 1, 'voltando').subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/1/restore`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'voltando' });
    req.flush({ ...versionPayload, versionNumber: 5, status: 'PUBLISHED' });
    expect((result as ReportVersion | null)?.versionNumber).toBe(5);
  });

  it('mantem REPLACED_DRAFT em vez de tratar como descartada', () => {
    let result: ReportVersionSummary[] = [];
    service.listReportVersions('r1').subscribe((res) => (result = res));
    http.expectOne(`${BASE}/reports/r1/versions`).flush([
      { versionNumber: 3, status: 'REPLACED_DRAFT' },
      { versionNumber: 2, status: 'replaced_draft' },
      { versionNumber: 1, status: 'NOVO_STATUS' },
    ]);
    expect(result.map((item) => item.status)).toEqual([
      'REPLACED_DRAFT',
      'REPLACED_DRAFT',
      'DISCARDED',
    ]);
  });

  it('retoma uma versao como rascunho novo, com nota opcional', () => {
    let result: ReportVersion | null = null;
    service.reuseReportVersion('r1', 2, ' voltando ').subscribe((res) => (result = res));

    const req = http.expectOne(`${BASE}/reports/r1/versions/2/reuse`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'voltando' });
    req.flush({ ...versionPayload, versionNumber: 6, status: 'DRAFT' });
    expect((result as ReportVersion | null)?.versionNumber).toBe(6);
    expect((result as ReportVersion | null)?.status).toBe('DRAFT');

    service.reuseReportVersion('r1', 2).subscribe();
    const noNote = http.expectOne(`${BASE}/reports/r1/versions/2/reuse`);
    expect(noNote.request.body).toEqual({});
    noNote.flush(versionPayload);
  });

  it('normaliza draft e openDraftVersion na listagem de relatorios', () => {
    let result: ReportDefinition[] = [];
    service.listReports().subscribe((res) => (result = res));
    http.expectOne(`${BASE}/reports`).flush([
      { id: 'r1', name: 'A', draft: true, openDraftVersion: 1 },
      { id: 'r2', name: 'B', openDraftVersion: '4' },
      { id: 'r3', name: 'C' },
    ]);

    expect(result.map((report) => [report.draft, report.openDraftVersion])).toEqual([
      [true, 1],
      [false, 4],
      [false, null],
    ]);
  });
});
