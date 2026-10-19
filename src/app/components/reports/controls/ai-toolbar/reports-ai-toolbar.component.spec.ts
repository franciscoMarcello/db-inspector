import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { ReportService } from '../../../../services/report.service';
import {
  AI_PENDING_POLL_MS,
  AiToolbarStatus,
  ReportsAiToolbarComponent,
} from './reports-ai-toolbar.component';

describe('ReportsAiToolbarComponent', () => {
  let fixture: ComponentFixture<ReportsAiToolbarComponent>;
  let component: ReportsAiToolbarComponent;
  let service: jasmine.SpyObj<ReportService>;
  let admin: boolean;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function trigger(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button[aria-haspopup="menu"]')!;
  }

  function overlayText(): string {
    return TestBed.inject(OverlayContainer).getContainerElement().textContent ?? '';
  }

  beforeEach(async () => {
    admin = true;
    service = jasmine.createSpyObj<ReportService>('ReportService', [
      'getAiApprovalsPendingCount',
      'downloadAiPackage',
    ]);
    service.getAiApprovalsPendingCount.and.returnValue(of(0));

    await TestBed.configureTestingModule({
      imports: [ReportsAiToolbarComponent],
      providers: [
        { provide: ReportService, useValue: service },
        { provide: AuthService, useValue: { isAdmin: () => admin } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  function create(): void {
    fixture = TestBed.createComponent(ReportsAiToolbarComponent);
    component = fixture.componentInstance;
  }

  it('nao mostra nada nem consulta pedidos para quem nao e admin', fakeAsync(() => {
    admin = false;
    create();
    fixture.detectChanges();
    tick(AI_PENDING_POLL_MS * 2);

    expect(text().trim()).toBe('');
    expect(service.getAiApprovalsPendingCount).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('mostra o botao IA para admin com o contador so quando ha pendentes', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(true);
    fixture.detectChanges();
    tick(0);
    fixture.detectChanges();

    expect(trigger().textContent).toContain('IA');
    expect(trigger().textContent).not.toMatch(/\d/);
    expect(trigger().getAttribute('aria-label')).toBe('Recursos de IA');

    service.getAiApprovalsPendingCount.and.returnValue(of(3));
    tick(AI_PENDING_POLL_MS);
    fixture.detectChanges();

    expect(trigger().textContent).toContain('3');
    expect(trigger().getAttribute('aria-label')).toContain('3 pedidos aguardando decisão');
    fixture.destroy();
  }));

  it('lista os quatro recursos de IA no menu', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(false);
    fixture.detectChanges();

    trigger().click();
    fixture.detectChanges();
    tick();

    expect(overlayText()).toContain('Pedidos da IA');
    expect(overlayText()).toContain('Manual');
    expect(overlayText()).toContain('Tokens para IA');
    expect(overlayText()).toContain('Instruções para IA');
    fixture.destroy();
  }));

  it('faz polling a cada 60 s so com a aba visivel e para no destroy', fakeAsync(() => {
    create();
    const visible = spyOn(component, 'isPageVisible').and.returnValue(true);
    fixture.detectChanges();
    tick(0);
    expect(service.getAiApprovalsPendingCount).toHaveBeenCalledTimes(1);

    tick(AI_PENDING_POLL_MS);
    expect(service.getAiApprovalsPendingCount).toHaveBeenCalledTimes(2);

    visible.and.returnValue(false);
    tick(AI_PENDING_POLL_MS * 3);
    expect(service.getAiApprovalsPendingCount).toHaveBeenCalledTimes(2);

    visible.and.returnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.getAiApprovalsPendingCount).toHaveBeenCalledTimes(3);

    fixture.destroy();
    tick(AI_PENDING_POLL_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.getAiApprovalsPendingCount).toHaveBeenCalledTimes(3);
  }));

  it('mantem o ultimo contador quando a consulta falha', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(true);
    service.getAiApprovalsPendingCount.and.returnValues(
      of(2),
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    fixture.detectChanges();
    tick(AI_PENDING_POLL_MS);

    expect(component.pendingCount()).toBe(2);
    fixture.destroy();
  }));

  it('baixa o pacote de instrucoes e informa a pagina', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(false);
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const messages: AiToolbarStatus[] = [];
    component.statusMessage.subscribe((status) => messages.push(status));
    service.downloadAiPackage.and.returnValue(of(new Blob(['PK'])));
    fixture.detectChanges();

    component.downloadPackage();

    expect(click).toHaveBeenCalledTimes(1);
    expect(messages[0].message).toContain('dbinspector-ia.zip');
    expect(component.downloadingPackage()).toBeFalse();
    fixture.destroy();
  }));

  it('informa falha ao baixar o pacote', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(false);
    const messages: AiToolbarStatus[] = [];
    component.statusMessage.subscribe((status) => messages.push(status));
    service.downloadAiPackage.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: new Blob(['x']) })),
    );
    fixture.detectChanges();

    component.downloadPackage();

    expect(messages[0].message).toBe('Falha ao baixar as instruções para IA.');
    fixture.destroy();
  }));

  it('atualiza o contador ao fechar os pedidos', fakeAsync(() => {
    create();
    spyOn(component, 'isPageVisible').and.returnValue(false);
    fixture.detectChanges();
    service.getAiApprovalsPendingCount.and.returnValue(of(1));

    component.openApprovals();
    component.closeApprovals();

    expect(component.approvalsOpen()).toBeFalse();
    expect(component.pendingCount()).toBe(1);
    fixture.destroy();
  }));
});
