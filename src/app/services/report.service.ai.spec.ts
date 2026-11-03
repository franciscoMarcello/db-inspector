import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvStorageService } from './env-storage.service';
import { AiApproval, AiToken, AiTokenCreated, ReportService } from './report.service';

const approval: AiApproval = {
  id: 'a1',
  status: 'PENDING',
  sql: 'SELECT 1',
  motivo: 'fechamento',
  linhasPedidas: 800,
  linhasAprovadas: null,
  custoEstimado: 1200,
  token: 'agente-custos',
  solicitadoPor: 'ana@empresa',
  decididoPor: null,
  decididoEm: null,
  nota: null,
  expiraEm: null,
  criadoEm: 1700000000000,
  vigente: false,
};

describe('ReportService - IA (tokens, pedidos e instrucoes)', () => {
  let service: ReportService;
  let http: HttpTestingController;
  let backend = '/api/db';

  beforeEach(() => {
    backend = '/api/db';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EnvStorageService, useValue: { getActive: () => ({ backend }) } },
      ],
    });
    service = TestBed.inject(ReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('monta a base absoluta a partir da base relativa usada pelo front', () => {
    expect(service.apiBaseUrl()).toBe(`${window.location.origin}/api/db`);
    backend = 'https://bi.empresa.com.br/api/db/';
    expect(service.apiBaseUrl()).toBe('https://bi.empresa.com.br/api/db');
  });

  it('lista os tokens de IA', () => {
    let result: AiToken[] = [];
    service.listAiTokens().subscribe((res) => (result = res));
    const req = http.expectOne('/api/db/ai/tokens');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 't1', name: 'agente', prefix: 'rpt_abcdefgh' }]);
    expect(result.map((token) => token.id)).toEqual(['t1']);
  });

  it('cria token com nome sem espacos extras e validade', () => {
    let result: AiTokenCreated | null = null;
    service
      .createAiToken({ name: '  agente custos  ', validityDays: 15 })
      .subscribe((res) => (result = res));
    const req = http.expectOne('/api/db/ai/tokens');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'agente custos', validityDays: 15 });
    req.flush(
      { id: 't1', name: 'agente custos', token: 'rpt_x', expiresAt: 1, warning: 'Guarde' },
      { status: 201, statusText: 'Created' },
    );
    expect((result as AiTokenCreated | null)?.token).toBe('rpt_x');
  });

  it('cria token sem validade quando ela nao e informada', () => {
    service.createAiToken({ name: 'agente' }).subscribe();
    const req = http.expectOne('/api/db/ai/tokens');
    expect(req.request.body).toEqual({ name: 'agente' });
    req.flush({});
  });

  it('revoga token', () => {
    service.revokeAiToken('t 1').subscribe();
    const req = http.expectOne('/api/db/ai/tokens/t%201');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('lista pedidos filtrando por status ou sem filtro', () => {
    service.listAiApprovals('PENDING').subscribe();
    const filtered = http.expectOne((req) => req.url === '/api/db/ai-approvals');
    expect(filtered.request.params.get('status')).toBe('PENDING');
    filtered.flush([approval]);

    service.listAiApprovals(null).subscribe();
    const all = http.expectOne((req) => req.url === '/api/db/ai-approvals');
    expect(all.request.params.has('status')).toBeFalse();
    all.flush([]);
  });

  it('le o contador de pendentes', () => {
    const counts: number[] = [];
    service.getAiApprovalsPendingCount().subscribe((count) => counts.push(count));
    http.expectOne('/api/db/ai-approvals/pending-count').flush({ pending: 4 });
    service.getAiApprovalsPendingCount().subscribe((count) => counts.push(count));
    http.expectOne('/api/db/ai-approvals/pending-count').flush({});
    expect(counts).toEqual([4, 0]);
  });

  it('aprova enviando linhas, minutos e nota sem espacos extras', () => {
    service.approveAiApproval('a1', { linhas: 500, minutos: 30, nota: '  ok  ' }).subscribe();
    const req = http.expectOne('/api/db/ai-approvals/a1/approve');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ linhas: 500, minutos: 30, nota: 'ok' });
    req.flush({ ...approval, status: 'APPROVED' });
  });

  it('aprova sem nota vazia no corpo', () => {
    service.approveAiApproval('a1', { linhas: 10, minutos: 60, nota: '   ' }).subscribe();
    const req = http.expectOne('/api/db/ai-approvals/a1/approve');
    expect(req.request.body).toEqual({ linhas: 10, minutos: 60 });
    req.flush(approval);
  });

  it('nega com nota opcional', () => {
    service.denyAiApproval('a1', ' fora do escopo ').subscribe();
    const withNote = http.expectOne('/api/db/ai-approvals/a1/deny');
    expect(withNote.request.method).toBe('POST');
    expect(withNote.request.body).toEqual({ nota: 'fora do escopo' });
    withNote.flush({ ...approval, status: 'DENIED' });

    service.denyAiApproval('a1').subscribe();
    const withoutNote = http.expectOne('/api/db/ai-approvals/a1/deny');
    expect(withoutNote.request.body).toEqual({});
    withoutNote.flush({ ...approval, status: 'DENIED' });
  });

  it('baixa o pacote de instrucoes como blob', () => {
    let result: Blob | null = null;
    service.downloadAiPackage().subscribe((blob) => (result = blob));
    const req = http.expectOne('/api/db/ai/pacote');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['PK']));
    expect(result).toEqual(jasmine.any(Blob));
  });

  it('carrega as instrucoes da IA como texto', () => {
    let result = '';
    service.getAiInstructions().subscribe((text) => (result = text));
    const req = http.expectOne('/api/db/ai/instrucoes');
    expect(req.request.responseType).toBe('text');
    req.flush('# Instrucoes');
    expect(result).toBe('# Instrucoes');
  });
});
