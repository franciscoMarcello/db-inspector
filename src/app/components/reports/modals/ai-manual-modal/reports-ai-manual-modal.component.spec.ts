import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ReportService } from '../../../../services/report.service';
import { ReportsAiManualModalComponent } from './reports-ai-manual-modal.component';

describe('ReportsAiManualModalComponent', () => {
  let fixture: ComponentFixture<ReportsAiManualModalComponent>;
  let component: ReportsAiManualModalComponent;
  let service: jasmine.SpyObj<ReportService>;

  function toggleInstructions(): void {
    const details = (fixture.nativeElement as HTMLElement).querySelector('details');
    if (!details) throw new Error('secao de instrucoes nao encontrada');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<ReportService>('ReportService', ['getAiInstructions']);
    await TestBed.configureTestingModule({
      imports: [ReportsAiManualModalComponent],
      providers: [{ provide: ReportService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(ReportsAiManualModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  it('explica o fluxo e o que a IA nao pode fazer, sem carregar as instrucoes ainda', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('rascunho');
    expect(text).toContain('Publicar versões de relatório.');
    expect(text).toContain('Enviar e-mail.');
    expect(text).toContain('Tokens expiram');
    expect(service.getAiInstructions).not.toHaveBeenCalled();
  });

  it('carrega as instrucoes uma vez ao abrir a secao e mostra como texto', () => {
    service.getAiInstructions.and.returnValue(of('# AGENTS.md\n- use rascunhos'));
    toggleInstructions();
    toggleInstructions();

    expect(service.getAiInstructions).toHaveBeenCalledTimes(1);
    const pre = (fixture.nativeElement as HTMLElement).querySelector('pre');
    expect(pre?.textContent).toContain('# AGENTS.md');
  });

  it('mostra erro e permite tentar de novo', () => {
    service.getAiInstructions.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 500 })),
      of('ok'),
    );
    toggleInstructions();
    expect(component.instructionsError()).toContain('Falha ao carregar');

    component.loadInstructions(true);
    expect(component.instructions()).toBe('ok');
    expect(component.instructionsError()).toBe('');
  });

  it('avisa o pai para abrir os tokens', () => {
    const spy = jasmine.createSpy('openTokens');
    component.openTokens.subscribe(spy);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Abrir Tokens para IA'))?.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
