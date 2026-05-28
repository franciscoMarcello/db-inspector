import {
  extractAclFlag,
  normalizeCompareResponse,
  normalizeReportColumnsResponse,
  normalizeVariableOptions,
} from './report.service.normalizers';

describe('report.service.normalizers', () => {
  it('le flag ACL por aliases', () => {
    expect(extractAclFlag({ can_view: 1 }, 'view')).toBeTrue();
    expect(extractAclFlag({ permissions: { run: 'false' } }, 'run')).toBeFalse();
  });

  it('normaliza colunas e merge', () => {
    const res = normalizeReportColumnsResponse('r1', {
      primaryColumns: ['A', 'B'],
      secondaryColumns: ['B', 'C'],
    });
    expect(res.reportId).toBe('r1');
    expect(res.mergedColumns).toEqual(['A', 'B', 'C']);
  });

  it('normaliza resposta de comparacao', () => {
    const cmp = normalizeCompareResponse({
      name: 'R',
      comparisonKey: 'id',
      source1: { label: 'S1', columns: ['id'], rows: [{ id: 1 }] },
      source2: { label: 'S2', columns: ['id'], rows: [{ id: 1 }] },
      diff: { matchCount: 1, equalCount: 1, differentCount: 0, withDifferences: [] },
    });
    expect(cmp.mode).toBe('keyed');
    expect(cmp.source1.rowCount).toBe(1);
  });

  it('normaliza opcoes de variavel', () => {
    const options = normalizeVariableOptions([{ value: 1, description: 'Um' }]);
    expect(options).toEqual([{ valor: 1, descricao: 'Um' }]);
  });
});
