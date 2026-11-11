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

  it('poe Executar e as exportacoes no cabecalho e os filtros num cartao proprio', () => {
    mount({ manage: false, canWrite: false });
    seed({ jasperTemplateId: 'tpl-1' });

    const header = root.querySelector('.report-header') as HTMLElement;
    expect(header.querySelector('app-button[tone="primary"]')?.textContent).toContain('Executar');
    expect(header.textContent).toContain('Excel');
    expect(header.textContent).toContain('PDF');
    expect(root.querySelector('.params-card .filters-row')).not.toBeNull();
    expect(root.querySelector('.filters-row app-button[tone="primary"]')).toBeNull();
  });

  it('nao usa ponto como separador entre as acoes dos filtros', () => {
    mount({ manage: false, canWrite: false });
    seed({ secondSql: 'select 1' });

    expect(root.querySelector('.report-tools')?.textContent).not.toContain('·');
  });

  it('marca filtros de texto opcionais com o placeholder Opcional', () => {
    mount({ manage: false, canWrite: false });
    seed({
      variables: [
        {
          key: 'item',
          label: 'item',
          type: 'string',
          required: false,
          multiple: false,
          defaultValue: null,
          orderIndex: 0,
        },
      ],
    });

    const input = root.querySelector<HTMLInputElement>('.filters-row input[type="text"]');
    expect(input?.placeholder).toBe('Opcional');
  });

  it('so pede para selecionar um relatorio quando nada esta selecionado', () => {
    mount({ manage: false, canWrite: false });
    seed();
    expect(root.textContent).not.toContain('Selecione um relatório');

    component.selectedReportId = null;
    fixture.detectChanges();
    expect(root.textContent).toContain('Selecione um relatório');
  });

  it('no modo usuario nao ha menu de acoes: as exportacoes ficam visiveis', () => {
    mount({ manage: false, canWrite: false });
    seed({ jasperTemplateId: 'tpl-1' });

    expect(root.querySelector('button[aria-label="Mais ações"]')).toBeNull();
    expect(root.querySelector('.report-header')?.textContent).toContain('Excel');
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

  describe('recolher filtros', () => {
    const KEY = 'dbi.reports.filters_collapsed';
    afterEach(() => localStorage.removeItem(KEY));

    function toggle() {
      root.querySelector<HTMLButtonElement>('app-button.filters-toggle button')!.click();
      fixture.detectChanges();
    }

    it('recolhe os campos, mostra o resumo com os valores e guarda a escolha', () => {
      localStorage.removeItem(KEY);
      mount({ manage: false, canWrite: false });
      seed();
      component.variableInputs = { data_inicial: '2026-11-01' };
      fixture.detectChanges();

      const button = root.querySelector('app-button.filters-toggle button')!;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      toggle();

      expect(root.querySelector('.filters-row')).toBeNull();
      const summary = root.querySelector('.filters-summary')?.textContent ?? '';
      expect(summary).toContain('Data inicial');
      expect(summary).toContain('01/11/2026');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.textContent).toContain('Mostrar filtros');
      expect(localStorage.getItem(KEY)).toBe('1');

      toggle();
      expect(root.querySelector('.filters-row')).not.toBeNull();
      expect(localStorage.getItem(KEY)).toBe('0');
    });

    it('filtro obrigatorio vazio reabre os campos para mostrar o erro', () => {
      localStorage.setItem(KEY, '1');
      mount({ manage: false, canWrite: false });
      seed();
      expect(root.querySelector('.filters-row')).toBeNull();

      expect(component.buildRunParams()).toBeNull();
      fixture.detectChanges();

      expect(root.querySelector('.filters-row')).not.toBeNull();
      expect(root.querySelector('.params-error')?.textContent).toContain('obrigatório');
    });
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

describe('ReportsComponent - testar uma versao', () => {
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
    spyOnProperty(component, 'canWriteReports').and.returnValue(true);
    component.manageMode = true;
    component.reports = [
      {
        ...report('r2'),
        variables: [
          { key: 'data', label: 'Data', type: 'date', required: false, multiple: false } as never,
        ],
      },
    ];
    component.selectedReportId = 'r2';
  });

  afterEach(() => http.match(() => true));

  function version(jrxml: string | null, keys: string[]) {
    return {
      reportId: 'r2',
      versionNumber: 8,
      status: 'DRAFT',
      name: 'Relatorio r2',
      sql: 'SELECT 1',
      variables: keys.map((key) => ({
        key,
        label: key,
        type: 'date',
        required: false,
        multiple: false,
      })),
      jrxml,
      authorType: 'AI_TOKEN',
      authorName: 'IA',
      createdAt: 0,
      revision: 1,
    };
  }

  it('sem versao escolhida executa a versao em uso', () => {
    component.applyFilters();

    expect(http.match('/api/db/reports/r2/run').length).toBe(1);
    expect(http.match((req) => req.url.includes('/versions/')).length).toBe(0);
  });

  it('com versao escolhida executa, marca o resultado e o PDF usa a mesma versao', () => {
    component.selectTestVersion(8);
    http.expectOne('/api/db/reports/r2/versions/8').flush(version('<jasperReport/>', ['data']));

    component.applyFilters();
    http.expectOne('/api/db/reports/r2/versions/8/run').flush({
      name: 'Relatorio r2',
      meta: { page: 0, size: 500, rowCount: 1, truncated: false },
      columns: ['a'],
      rows: [{ a: 1 }],
    });
    expect(component.runResultVersionNumber).toBe(8);

    expect(component.canExportPdf).toBeTrue();
    component.exportPdf();
    expect(http.match('/api/db/reports/r2/versions/8/pdf').length).toBe(1);
  });

  it('avisa quando a versao tem filtros diferentes dos da pagina', () => {
    component.selectTestVersion(8);
    http.expectOne('/api/db/reports/r2/versions/8').flush(version(null, ['data', 'safra']));

    expect(component.testVersionWarning).toContain('safra');
    expect(component.canExportPdf).toBeFalse();
  });

  it('voltar para a versao em uso limpa o resultado da versao', () => {
    component.selectTestVersion(8);
    component.runResult = { name: 'x', meta: {}, columns: [], rows: [] } as never;

    component.selectTestVersion(null);

    expect(component.runResult).toBeNull();
    expect(component.testVersion).toBeNull();
  });
});
