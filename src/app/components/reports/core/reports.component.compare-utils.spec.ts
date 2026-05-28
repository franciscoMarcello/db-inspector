import {
  compareCellDiffClass,
  compareDifferentFields,
  compareDifferentFieldsCountLabel,
  compareDifferentFieldsLabel,
  formatCompareDelta,
  formatCompareDiffPercent,
} from './reports.component.compare-utils';

describe('reports.component.compare-utils', () => {
  it('lista campos divergentes', () => {
    const item = {
      fields: {
        a: { equal: false },
        b: { equal: true },
      },
    };
    expect(compareDifferentFields(item)).toEqual(['a']);
    expect(compareDifferentFieldsLabel(item)).toBe('a');
    expect(compareDifferentFieldsCountLabel(item)).toBe('1 divergência');
  });

  it('formata delta e percentual', () => {
    expect(formatCompareDelta(5)).toBe('+5');
    expect(formatCompareDelta(-3)).toBe('-3');
    expect(formatCompareDiffPercent({ source2: 200, diff: 10 })).toBe('+5.00%');
  });

  it('marca classe de celula alterada e ausente', () => {
    const item = {
      fields: {
        total: { equal: false, source1: null, source2: 10 },
      },
    };
    const classes = compareCellDiffClass(item, 'total');
    expect(classes['diff-cell--changed']).toBeTrue();
    expect(classes['diff-cell--missing']).toBeTrue();
  });
});
