import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countColors } from './check-colors.mjs';

test('conta hex curto, hex longo e funcoes de cor', () => {
  assert.equal(countColors('a{color:#fff;background:#0f172a;border-color:#2563ebcc}'), 3);
  assert.equal(countColors('box-shadow: 0 1px rgba(0,0,0,.1), 0 0 rgb(1 2 3) hsl(0 0% 0%)'), 3);
});

test('conta cor dentro de classe arbitraria do Tailwind', () => {
  assert.equal(countColors('class="hover:bg-[rgba(148,163,184,0.16)] border-[#60a5fa]"'), 2);
});

test('ignora variaveis, referencias de template e ancoras', () => {
  assert.equal(countColors('color: var(--text-primary); background: var(--bg-surface)'), 0);
  assert.equal(
    countColors('<mat-menu #actionsMenu="matMenu"> <a href="#reports-advanced-panel">'),
    0,
  );
});
