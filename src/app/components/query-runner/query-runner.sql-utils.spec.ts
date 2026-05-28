import { buildVariablesMap, expandSqlVariables, extractSqlVariables, stripSqlComments } from './query-runner.sql-utils';

describe('query-runner.sql-utils', () => {
  it('remove comentarios sem quebrar strings', () => {
    const sql = "SELECT ':x' AS t -- comentario\n/* bloco */\nWHERE id = :id";
    const clean = stripSqlComments(sql);
    expect(clean).toContain("':x'");
    expect(clean).toContain(':id');
    expect(clean).not.toContain('comentario');
  });

  it('extrai variaveis unicas ordenadas', () => {
    const vars = extractSqlVariables('select :b, :a, :b from dual');
    expect(vars).toEqual(['a', 'b']);
  });

  it('expande variaveis com escape', () => {
    const sql = "select :name as n, :qty as q";
    const out = expandSqlVariables(sql, { name: "O'Hara", qty: 2 });
    expect(out).toContain("'O''Hara'");
    expect(out).toContain('2');
  });

  it('constroi mapa tipado de variaveis', () => {
    const map = buildVariablesMap(['n', 'b', 'd', 's'], {
      n: '10',
      b: 'true',
      d: '2024-10-01',
      s: 'abc',
    });
    expect(map['n']).toBe(10);
    expect(map['b']).toBeTrue();
    expect(map['d'] instanceof Date).toBeTrue();
    expect(map['s']).toBe('abc');
  });
});
