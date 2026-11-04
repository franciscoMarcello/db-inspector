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

test('ignora entidades HTML de chaves', () => {
  assert.equal(countColors('<code>&#123;&#123; :data_inicio &#125;&#125;</code>'), 0);
});

test('ignora variaveis, referencias de template e ancoras', () => {
  assert.equal(countColors('color: var(--text-primary); background: var(--bg-surface)'), 0);
  assert.equal(
    countColors('<mat-menu #actionsMenu="matMenu"> <a href="#reports-advanced-panel">'),
    0,
  );
});

test('conta hex dentro de color-mix do Tailwind, onde vem seguido de _', () => {
  assert.equal(countColors('bg-[color-mix(in_srgb,#f59e0b_10%,transparent)]'), 1);
});

test('nao conta ancoras de link nem palavras que comecam com hex', () => {
  assert.equal(countColors('<a href="#abc">ir</a>'), 0);
  assert.equal(countColors('<div #cabinet></div>'), 0);
  assert.equal(countColors('id="w#fff"'), 0);
  assert.equal(countColors("<a href='#abc'>ir</a>"), 0);
});

test('conta cor entre aspas em binding do Angular', () => {
  assert.equal(countColors(`[ngStyle]="{ color: '#fff' }"`), 1);
  assert.equal(countColors('style="color:#fff"'), 1);
});
