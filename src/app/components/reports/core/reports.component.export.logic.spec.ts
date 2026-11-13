import { ReportCompareResponse } from '../../../services/report.service';
import { buildCompareSideBySide } from './reports.component.export.logic';

describe('buildCompareSideBySide', () => {
  const cmp = (comparisonKey: string | null) =>
    ({
      name: 'x',
      mode: 'keyed',
      comparisonKey,
      source1: {
        columns: ['contrato', 'quantidade', 'quantidade_total', 'descricao_agromobi'],
        rows: [
          { contrato: '0054', quantidade: 2272, quantidade_total: 4041, descricao_agromobi: 'A' },
          { contrato: '0068', quantidade: 4, quantidade_total: 102, descricao_agromobi: 'B' },
        ],
      },
      source2: {
        columns: ['contrato', 'quantidade', 'quantidade_total', 'itens_sap'],
        rows: [
          { contrato: '0054', quantidade: '3176', quantidade_total: 3943, itens_sap: 'CTR13' },
          { contrato: '0099', quantidade: 1, quantidade_total: 1, itens_sap: 'CTR99' },
        ],
      },
      duplicateKeysSource1: [],
      duplicateKeysSource2: [],
      diff: null,
    }) as unknown as ReportCompareResponse;

  it('poe AgroMobi, SAP e diferenca lado a lado so para colunas comuns', () => {
    const result = buildCompareSideBySide(cmp('contrato'))!;
    expect(result.columns).toEqual([
      'contrato',
      'quantidade_agromobi',
      'quantidade_sap',
      'quantidade_diferenca',
      'quantidade_total_agromobi',
      'quantidade_total_sap',
      'quantidade_total_diferenca',
    ]);
    expect(result.rows.map((r) => r['contrato'])).toEqual(['0054', '0068', '0099']);
    expect(result.rows[0]['quantidade_diferenca']).toBe(-904);
    expect(result.rows[0]['quantidade_total_diferenca']).toBe(98);
    expect(result.rows[1]['quantidade_sap']).toBeNull();
    expect(result.rows[1]['quantidade_diferenca']).toBeNull();
    expect(result.rows[2]['quantidade_agromobi']).toBeNull();
  });

  it('nao gera a aba sem chave de comparacao', () => {
    expect(buildCompareSideBySide(cmp(null))).toBeNull();
  });
});
