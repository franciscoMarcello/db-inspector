import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { ReportDefinition } from '../../../services/report.service';
import { EnvStorageService } from '../../../services/env-storage.service';
import { ReportsComponent } from './reports.component';

function report(id: string): ReportDefinition {
  return {
    id,
    name: `Relatorio ${id}`,
    folderId: 'f1',
    sql: 'SELECT 1',
    description: null,
    variables: [],
    archived: false,
    draft: id === 'r1',
    openDraftVersion: id === 'r1' ? 1 : null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('ReportsComponent - versoes', () => {
  let component: ReportsComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EnvStorageService, useValue: { getActive: () => ({ backend: '/api/db' }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { manage: true } } } },
      ],
    });
    component = TestBed.createComponent(ReportsComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
    component.manageMode = true;
    component.reports = [report('r1'), report('r2')];
    component.selectedFolderId = 'f1';
    component.selectedReportId = 'r1';
    component.versionsModalOpen = true;
  });

  afterEach(() => http.match(() => true));

  it('remove o relatorio apagado da arvore e da selecao e recarrega a lista', () => {
    component.onReportVersionsChanged({
      reportId: 'r1',
      action: 'discard',
      reportDeleted: true,
      message: 'Rascunho v1 descartado. O relatório foi removido.',
    });

    expect(component.reports.map((item) => item.id)).toEqual(['r2']);
    expect(component.selectedReportId).toBeNull();
    expect(component.versionsModalOpen).toBeFalse();
    expect(component.statusMessage).toContain('foi removido');
    expect(http.match('/api/db/reports').length).toBe(1);
  });

  it('apos publicar mantem o relatorio selecionado e recarrega a lista', () => {
    component.onReportVersionsChanged({
      reportId: 'r1',
      action: 'publish',
      reportDeleted: false,
      message: 'Versão 1 publicada.',
    });

    expect(component.reports.length).toBe(2);
    expect(component.selectedReportId).toBe('r1');
    expect(component.versionsModalOpen).toBeTrue();
    expect(http.match('/api/db/reports').length).toBe(1);
  });

  it('abre o modal de versoes com um retrato dos parametros da pagina', () => {
    spyOnProperty(component, 'canWriteReports').and.returnValue(true);
    component.versionsModalOpen = false;
    component.variableInputs = { safra: '2025' };

    component.openVersionsModal();
    component.variableInputs['safra'] = '2026';

    expect(component.versionsModalOpen).toBeTrue();
    expect(component.versionsParamInputs).toEqual({ safra: '2025' });
  });
});
