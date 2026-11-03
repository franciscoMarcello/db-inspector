import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AiApproval, ReportService } from '../../../../services/report.service';
import {
  approvalStatusLabel,
  buildApprovalDecision,
  defaultApprovalRows,
  ReportsAiApprovalsModalComponent,
  sortApprovals,
} from './reports-ai-approvals-modal.component';

function approval(overrides: Partial<AiApproval> = {}): AiApproval {
  return {
    id: 'a1',
    status: 'PENDING',
    sql: 'SELECT * FROM agro.colheita',
    motivo: 'fechamento da safra',
    linhasPedidas: 800,
    linhasAprovadas: null,
    custoEstimado: 12500,
    token: 'agente custos',
    solicitadoPor: 'ana@empresa',
    decididoPor: null,
    decididoEm: null,
    nota: null,
    expiraEm: null,
    criadoEm: 1700000000000,
    vigente: false,
    ...overrides,
  };
}

describe('reports-ai-approvals-modal helpers', () => {
  it('limita as linhas padrao ao maximo permitido', () => {
    expect(defaultApprovalRows(800)).toBe(800);
    expect(defaultApprovalRows(9000)).toBe(5000);
    expect(defaultApprovalRows(0)).toBe(1);
  });

  it('valida linhas e minutos dentro dos limites', () => {
    expect(buildApprovalDecision(0, 60, '').error).toContain('entre 1 e 5000');
    expect(buildApprovalDecision(5001, 60, '').error).toContain('entre 1 e 5000');
    expect(buildApprovalDecision(2.5, 60, '').error).toContain('entre 1 e 5000');
    expect(buildApprovalDecision('', 60, '').error).toContain('entre 1 e 5000');
    expect(buildApprovalDecision(100, 0, '').error).toContain('entre 1 e 1440');
    expect(buildApprovalDecision(100, 1441, '').error).toContain('entre 1 e 1440');
    expect(buildApprovalDecision(100, 60, 'x'.repeat(2001)).error).toContain('2000');
    expect(buildApprovalDecision('5000', '1440', '  ok  ').decision).toEqual({
      linhas: 5000,
      minutos: 1440,
      nota: 'ok',
    });
    expect(buildApprovalDecision(1, 1, '   ').decision).toEqual({ linhas: 1, minutos: 1 });
  });

  it('coloca os pendentes primeiro e depois os mais recentes', () => {
    const sorted = sortApprovals([
      approval({ id: 'velho-aprovado', status: 'APPROVED', criadoEm: 3 }),
      approval({ id: 'pendente-antigo', criadoEm: 1 }),
      approval({ id: 'negado', status: 'DENIED', criadoEm: 5 }),
      approval({ id: 'pendente-novo', criadoEm: 2 }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      'pendente-novo',
      'pendente-antigo',
      'negado',
      'velho-aprovado',
    ]);
  });

  it('rotula o status considerando a vigencia', () => {
    expect(approvalStatusLabel({ status: 'PENDING', vigente: false })).toBe('Pendente');
    expect(approvalStatusLabel({ status: 'DENIED', vigente: false })).toBe('Negado');
    expect(approvalStatusLabel({ status: 'APPROVED', vigente: true })).toBe('Aprovado (vigente)');
    expect(approvalStatusLabel({ status: 'APPROVED', vigente: false })).toBe('Aprovado (expirado)');
  });
});

describe('ReportsAiApprovalsModalComponent', () => {
  let fixture: ComponentFixture<ReportsAiApprovalsModalComponent>;
  let component: ReportsAiApprovalsModalComponent;
  let service: jasmine.SpyObj<ReportService>;
  let changed: jasmine.Spy;

  beforeEach(async () => {
    service = jasmine.createSpyObj<ReportService>('ReportService', [
      'listAiApprovals',
      'approveAiApproval',
      'denyAiApproval',
    ]);
    service.listAiApprovals.and.returnValue(of([approval({ linhasPedidas: 9000 })]));

    await TestBed.configureTestingModule({
      imports: [ReportsAiApprovalsModalComponent],
      providers: [{ provide: ReportService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsAiApprovalsModalComponent);
    component = fixture.componentInstance;
    changed = jasmine.createSpy('changed');
    component.changed.subscribe(changed);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  it('abre listando os pendentes e mostra os dados do pedido', () => {
    expect(service.listAiApprovals).toHaveBeenCalledOnceWith('PENDING');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('agente custos');
    expect(text).toContain('fechamento da safra');
    expect(text).toContain('SELECT * FROM agro.colheita');
    expect(text).toContain('12.500');
  });

  it('filtra por status e usa sem filtro para "Todos"', () => {
    component.setFilter('DENIED');
    component.setFilter('ALL');
    expect(service.listAiApprovals.calls.allArgs()).toEqual([['PENDING'], ['DENIED'], [null]]);
  });

  it('abre a aprovacao com linhas pedidas limitadas a 5000 e 60 minutos', () => {
    component.startDecision(approval({ linhasPedidas: 9000 }), 'approve');
    expect(component.rows()).toBe(5000);
    expect(component.minutes()).toBe(60);
  });

  it('nao aprova fora dos limites', () => {
    const item = approval();
    component.startDecision(item, 'approve');
    component.rows.set(6000);
    component.confirmDecision(item);
    expect(service.approveAiApproval).not.toHaveBeenCalled();
    expect(component.decisionError()).toContain('entre 1 e 5000');

    component.rows.set(100);
    component.minutes.set(2000);
    component.confirmDecision(item);
    expect(service.approveAiApproval).not.toHaveBeenCalled();
    expect(component.decisionError()).toContain('entre 1 e 1440');
  });

  it('aprova com os valores escolhidos, recarrega e avisa o contador', () => {
    const item = approval();
    service.approveAiApproval.and.returnValue(of({ ...item, status: 'APPROVED' }));
    component.startDecision(item, 'approve');
    component.rows.set(300);
    component.minutes.set(90);
    component.note.set(' revisado ');

    component.confirmDecision(item);

    expect(service.approveAiApproval).toHaveBeenCalledOnceWith('a1', {
      linhas: 300,
      minutos: 90,
      nota: 'revisado',
    });
    expect(component.feedback()?.message).toContain('até 300 linhas');
    expect(component.decision()).toBeNull();
    expect(service.listAiApprovals).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('nega com nota', () => {
    const item = approval();
    service.denyAiApproval.and.returnValue(of({ ...item, status: 'DENIED' }));
    component.startDecision(item, 'deny');
    component.note.set('fora do escopo');

    component.confirmDecision(item);

    expect(service.denyAiApproval).toHaveBeenCalledOnceWith('a1', 'fora do escopo');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('em 409 avisa que ja foi decidido, recarrega a lista e o contador', () => {
    const item = approval();
    service.approveAiApproval.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { mensagem: 'ja decidida' } })),
    );
    component.startDecision(item, 'approve');

    component.confirmDecision(item);

    expect(component.feedback()?.tone).toBe('status-error');
    expect(component.feedback()?.message).toContain('já foi decidido');
    expect(component.decision()).toBeNull();
    expect(service.listAiApprovals).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('mantem o formulario aberto e mostra o erro em outras falhas', () => {
    const item = approval();
    service.approveAiApproval.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { mensagem: 'banco fora' } })),
    );
    component.startDecision(item, 'approve');

    component.confirmDecision(item);

    expect(component.decisionError()).toBe('banco fora');
    expect(component.decision()).not.toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
});
