import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
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

describe('ReportsComponent - layout compacto', () => {
  let fixture: ComponentFixture<ReportsComponent>;
  let component: ReportsComponent;
  let http: HttpTestingController;
  let root: HTMLElement;

  function mount(options: { manage: boolean; canWrite: boolean }) {
    TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EnvStorageService, useValue: { getActive: () => ({ backend: '/api/db' }) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { manage: options.manage } } },
        },
        {
          provide: AuthService,
          useValue: { isAdmin: () => false, hasPermission: () => options.canWrite },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  function seed(overrides: Partial<ReportDefinition> = {}) {
    component.sidebarCollapsed = false;
    component.folders = [
      { id: 'f1', name: 'Agricultura', description: null, archived: false, expanded: false },
    ];
    component.reports = [
      {
        ...report('r2'),
        draft: false,
        variables: [
          {
            key: 'data_inicial',
            label: 'data_inicial',
            type: 'date',
            required: true,
            multiple: false,
            defaultValue: null,
            orderIndex: 0,
          },
        ],
        ...overrides,
      },
    ];
    component.selectedFolderId = 'f1';
    component.selectedReportId = 'r2';
    component.variableInputs = { data_inicial: '' };
    fixture.detectChanges();
  }

  async function openActionsMenu(): Promise<string> {
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="Mais ações"]');
    trigger?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return TestBed.inject(OverlayContainer).getContainerElement().textContent ?? '';
  }

  afterEach(() => http.match(() => true));

  it('mostra um unico botao primario e rotulos legiveis sem titulos de grupo', () => {
    mount({ manage: false, canWrite: false });
    seed();

    expect(root.querySelectorAll('section.filters app-button[tone="primary"]').length).toBe(1);
    expect(root.textContent).toContain('Data inicial');
    expect(root.textContent).not.toContain('data_inicial');
    expect(root.textContent?.toLowerCase()).not.toContain('filtros principais');
    expect(root.textContent?.toLowerCase()).not.toContain('filtros adicionais');
  });

  it('so pede para selecionar um relatorio quando nada esta selecionado', () => {
    mount({ manage: false, canWrite: false });
    seed();
    expect(root.textContent).not.toContain('Selecione um relatório');

    component.selectedReportId = null;
    fixture.detectChanges();
    expect(root.textContent).toContain('Selecione um relatório');
  });

  it('no modo usuario o menu so tem exportacao', async () => {
    mount({ manage: false, canWrite: false });
    seed({ jasperTemplateId: 'tpl-1' });

    const menu = await openActionsMenu();

    expect(menu).toContain('Exportar Excel');
    expect(menu).not.toContain('Editar relatório');
    expect(menu).not.toContain('Novo relatório');
  });

  it('na gestao o menu traz edicao, versoes, arquivar e novo relatorio', async () => {
    mount({ manage: true, canWrite: true });
    seed();

    const menu = await openActionsMenu();

    expect(menu).toContain('Editar relatório');
    expect(menu).toContain('Versões');
    expect(menu).toContain('Arquivar');
    expect(menu).not.toContain('Desarquivar');
    expect(menu).toContain('Novo relatório');
  });

  it('com relatorio arquivado o menu oferece Desarquivar no lugar de Arquivar', async () => {
    mount({ manage: true, canWrite: true });
    seed({ archived: true });

    const menu = await openActionsMenu();

    expect(menu).toContain('Desarquivar');
    expect(menu.replace('Desarquivar', '')).not.toContain('Arquivar');
  });

  it('esconde tolerancias ate abrir Avancado e so para relatorios com comparacao', () => {
    mount({ manage: false, canWrite: false });
    seed({ secondSql: 'SELECT 2' });
    expect(root.querySelector('app-reports-compare-tolerances')).toBeNull();

    component.toggleAdvanced();
    fixture.detectChanges();
    expect(root.querySelector('app-reports-compare-tolerances')).not.toBeNull();

    component.advancedOpen.set(false);
    seed({ secondSql: null });
    expect(root.textContent).not.toContain('Avançado');
  });

  it('abre o painel Avancado quando a tolerancia e invalida', () => {
    mount({ manage: false, canWrite: false });
    seed({ secondSql: 'SELECT 2' });
    component.variableInputs = { data_inicial: '2026-10-01' };
    component.compareToleranceRows = [{ field: '', tolerance: '0.01' }];

    component.compareSelectedReport();

    expect(component.advancedOpen()).toBeTrue();
    expect(component.compareToleranceError).toContain('campo');
  });

  it('expande a pasta recolhida ao seleciona-la', () => {
    mount({ manage: false, canWrite: false });
    seed();

    component.selectFolder(component.folders[0]);

    expect(component.folders[0].expanded).toBeTrue();
  });

  it('mostra a orientacao inline no estado vazio e o spinner ao executar', () => {
    mount({ manage: false, canWrite: false });
    seed();
    expect(root.textContent).toContain('Preencha os filtros e clique em Executar');

    component.loadingRun = true;
    fixture.detectChanges();
    expect(root.textContent).toContain('Executando relatório...');
  });
});
