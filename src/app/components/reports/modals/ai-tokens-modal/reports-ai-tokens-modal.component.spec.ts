import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AiToken, AiTokenCreated, ReportService } from '../../../../services/report.service';
import {
  aiCommandBlocks,
  aiTokenSituation,
  buildAiConnectionCommands,
  ReportsAiTokensModalComponent,
  validateAiTokenForm,
} from './reports-ai-tokens-modal.component';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function token(overrides: Partial<AiToken> = {}): AiToken {
  return {
    id: 't1',
    name: 'agente custos',
    prefix: 'rpt_abcdefgh',
    createdBy: 'ana@empresa',
    createdAt: NOW - DAY,
    expiresAt: NOW + 30 * DAY,
    revokedAt: null,
    lastUsedAt: null,
    active: true,
    expired: false,
    ...overrides,
  };
}

describe('reports-ai-tokens-modal helpers', () => {
  it('monta os comandos de conexao com a base e o token', () => {
    const commands = buildAiConnectionCommands('https://bi.empresa.com.br/api/db/', 'rpt_SEGREDO');
    expect(commands.mcpUrl).toBe('https://bi.empresa.com.br/api/db/ai/mcp');
    expect(commands.mcpCli).toBe(
      'claude mcp add --transport http dbinspector https://bi.empresa.com.br/api/db/ai/mcp ' +
        '--header "Authorization: Bearer rpt_SEGREDO"',
    );
    expect(JSON.parse(commands.mcpJson)).toEqual({
      mcpServers: {
        dbinspector: {
          type: 'http',
          url: 'https://bi.empresa.com.br/api/db/ai/mcp',
          headers: { Authorization: 'Bearer rpt_SEGREDO' },
        },
      },
    });
    expect(commands.openApiUrl).toBe('https://bi.empresa.com.br/api/db/ai/openapi.yaml');
    expect(commands.curl).toBe(
      'curl -H "Authorization: Bearer rpt_SEGREDO" https://bi.empresa.com.br/api/db/ai/instrucoes',
    );
  });

  it('monta os comandos do Codex com o token em variavel de ambiente, nunca no comando', () => {
    const commands = buildAiConnectionCommands('https://bi.empresa.com.br/api/db/', 'rpt_SEGREDO');

    expect(commands.codexEnv).toBe('export DBINSPECTOR_TOKEN="rpt_SEGREDO"');
    expect(commands.codexCli).toBe(
      'codex mcp add dbinspector --url https://bi.empresa.com.br/api/db/ai/mcp ' +
        '--bearer-token-env-var DBINSPECTOR_TOKEN',
    );
    expect(commands.codexCli).not.toContain('rpt_SEGREDO');
    expect(commands.codexToml).toBe(
      '[mcp_servers.dbinspector]\n' +
        'url = "https://bi.empresa.com.br/api/db/ai/mcp"\n' +
        'bearer_token_env_var = "DBINSPECTOR_TOKEN"',
    );
    expect(commands.codexToml).not.toContain('rpt_SEGREDO');
  });

  it('separa os blocos por modo de conexao', () => {
    const commands = buildAiConnectionCommands('https://x/api/db', 'rpt_1');
    expect(aiCommandBlocks(commands, 'mcp').map((block) => block.key)).toEqual([
      'mcpCli',
      'codexEnv',
      'codexCli',
      'codexToml',
      'mcpJson',
    ]);
    expect(aiCommandBlocks(commands, 'openapi')[0].text).toBe(commands.openApiUrl);
    expect(aiCommandBlocks(commands, 'rest')[0].text).toBe(commands.curl);
  });

  it('classifica a situacao do token e destaca o que pede atencao', () => {
    expect(aiTokenSituation(token(), NOW)).toEqual({ label: 'Ativo', tone: 'ok', attention: '' });
    expect(aiTokenSituation(token({ revokedAt: NOW - DAY, active: false }), NOW).label).toBe(
      'Revogado',
    );
    const expired = aiTokenSituation(token({ expired: true, active: false }), NOW);
    expect(expired.label).toBe('Expirado');
    expect(expired.tone).toBe('warn');
    const soon = aiTokenSituation(token({ expiresAt: NOW + 3 * DAY - 1000 }), NOW);
    expect(soon).toEqual({ label: 'Ativo', tone: 'warn', attention: 'Expira em 3 dias.' });
  });

  it('valida nome e validade do token', () => {
    expect(validateAiTokenForm('  ', 30).error).toContain('nome');
    expect(validateAiTokenForm('x'.repeat(121), 30).error).toContain('120');
    expect(validateAiTokenForm('agente', 0).error).toContain('entre 1 e 90');
    expect(validateAiTokenForm('agente', 91).error).toContain('entre 1 e 90');
    expect(validateAiTokenForm('agente', 2.5).error).toContain('entre 1 e 90');
    expect(validateAiTokenForm('agente', '').error).toContain('entre 1 e 90');
    expect(validateAiTokenForm(' agente ', '90').input).toEqual({
      name: 'agente',
      validityDays: 90,
    });
  });
});

describe('ReportsAiTokensModalComponent', () => {
  let fixture: ComponentFixture<ReportsAiTokensModalComponent>;
  let component: ReportsAiTokensModalComponent;
  let service: jasmine.SpyObj<ReportService>;
  const created: AiTokenCreated = {
    id: 't9',
    name: 'agente novo',
    token: 'rpt_VALOR_SECRETO_123',
    expiresAt: NOW + 30 * DAY,
    warning: 'Guarde agora: este valor nao sera exibido de novo.',
  };

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  function open(): void {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<ReportService>('ReportService', [
      'listAiTokens',
      'createAiToken',
      'revokeAiToken',
      'apiBaseUrl',
    ]);
    service.listAiTokens.and.returnValue(of([token()]));
    service.createAiToken.and.returnValue(of(created));
    service.apiBaseUrl.and.returnValue('https://bi.empresa.com.br/api/db');

    await TestBed.configureTestingModule({
      imports: [ReportsAiTokensModalComponent],
      providers: [{ provide: ReportService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsAiTokensModalComponent);
    component = fixture.componentInstance;
  });

  it('lista os tokens ao abrir', () => {
    open();
    expect(service.listAiTokens).toHaveBeenCalledTimes(1);
    expect(text()).toContain('agente custos');
    expect(text()).toContain('rpt_abcdefgh...');
    expect(text()).toContain('Ativo');
  });

  it('nao chama o backend com formulario invalido', () => {
    open();
    component.name.set('agente');
    component.validityDays.set(120);
    component.createToken();
    expect(service.createAiToken).not.toHaveBeenCalled();
    expect(component.formError()).toContain('entre 1 e 90');
  });

  it('exibe o token uma unica vez, com os comandos preenchidos, e limpa ao fechar', () => {
    const closed = jasmine.createSpy('close');
    component.close.subscribe(closed);
    open();
    component.name.set('agente novo');
    component.validityDays.set(15);

    component.createToken();
    fixture.detectChanges();

    expect(service.createAiToken).toHaveBeenCalledOnceWith({
      name: 'agente novo',
      validityDays: 15,
    });
    expect(text()).toContain('Guarde agora: este valor não será exibido de novo.');
    expect((fixture.nativeElement as HTMLElement).querySelector('input[readonly]')).toBeTruthy();
    expect((fixture.nativeElement.querySelector('input[readonly]') as HTMLInputElement).value).toBe(
      created.token,
    );
    expect(text()).toContain(
      'claude mcp add --transport http dbinspector https://bi.empresa.com.br/api/db/ai/mcp',
    );

    component.closeModal();
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(component.created()).toBeNull();
    expect(html()).not.toContain(created.token);

    open();
    expect(component.created()).toBeNull();
    expect(html()).not.toContain(created.token);
  });

  it('limpa o token quando o modal e fechado pelo pai', () => {
    open();
    component.name.set('agente novo');
    component.createToken();
    fixture.detectChanges();
    expect(component.created()?.info.token).toBe(created.token);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    expect(component.created()).toBeNull();
  });

  it('descarta a resposta da criacao quando o modal fecha antes dela chegar', () => {
    const pending = new Subject<AiTokenCreated>();
    service.createAiToken.and.returnValue(pending.asObservable());
    open();
    component.name.set('agente novo');
    component.createToken();
    expect(component.creating()).toBeTrue();

    component.closeModal();
    pending.next(created);
    pending.complete();
    fixture.detectChanges();

    expect(component.created()).toBeNull();
    expect(component.creating()).toBeFalse();
    expect(html()).not.toContain(created.token);
  });

  it('ao concluir esconde o token e recarrega a lista', () => {
    open();
    component.name.set('agente novo');
    component.createToken();
    fixture.detectChanges();

    component.finishCreated();
    fixture.detectChanges();

    expect(component.created()).toBeNull();
    expect(html()).not.toContain(created.token);
    expect(service.listAiTokens).toHaveBeenCalledTimes(2);
  });

  it('revoga com confirmacao e trata token ja revogado (409)', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.revokeAiToken.and.returnValues(
      of(undefined),
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    open();

    component.revoke(token());
    expect(service.revokeAiToken).toHaveBeenCalledWith('t1');
    expect(component.feedback()?.tone).toBe('status-success');
    expect(service.listAiTokens).toHaveBeenCalledTimes(2);

    component.revoke(token());
    expect(component.feedback()?.message).toContain('já estava revogado');
    expect(service.listAiTokens).toHaveBeenCalledTimes(3);
  });

  it('nao revoga quando a confirmacao e cancelada', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    open();
    component.revoke(token());
    expect(service.revokeAiToken).not.toHaveBeenCalled();
  });
});
