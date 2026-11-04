---
name: AgroReport (DB Inspector)
description: Ferramenta interna densa para explorar o banco, rodar consultas e publicar relatorios, em tema claro e escuro.
colors:
  page: "#f6f7f9"
  surface: "#ffffff"
  surface-alt: "#f1f3f6"
  line: "#dce0e6"
  line-strong: "#8b95a5"
  ink: "#0f172a"
  muted: "#475569"
  chip: "#e8edf5"
  accent: "#2563eb"
  on-accent: "#ffffff"
  accent-soft: "#eaf1fe"
  accent-soft-text: "#1d4ed8"
  danger: "#b42318"
  warning-soft: "#fff4db"
  warning-soft-text: "#7a4a00"
  success: "#166534"
  warning: "#92400e"
  info: "#155e75"
  attention: "#9a3412"
  scroll-track: "#f1f3f6"
  scroll-thumb: "#a3acb9"
  backdrop: "rgb(15 23 42 / 0.45)"
  code-bg: "#1e1e1e"
  page-dark: "#0a0f1c"
  surface-dark: "#131a2b"
  surface-alt-dark: "#0e1424"
  line-dark: "#243049"
  line-strong-dark: "#5b6b8c"
  ink-dark: "#e6e9f0"
  muted-dark: "#9aa4b8"
  chip-dark: "#1c2438"
  accent-dark: "#3b5bdb"
  on-accent-dark: "#ffffff"
  accent-soft-dark: "#1c2747"
  accent-soft-text-dark: "#c7d3ff"
  danger-dark: "#f4a79d"
  warning-soft-dark: "#3a2e12"
  warning-soft-text-dark: "#f5d48a"
  success-dark: "#4ade80"
  warning-dark: "#fbbf24"
  info-dark: "#67e8f9"
  attention-dark: "#fb923c"
  scroll-track-dark: "#0a0f1c"
  scroll-thumb-dark: "#33405c"
  backdrop-dark: "rgb(2 6 23 / 0.7)"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 700
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
  subtitle:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  body-sm:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  data:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "tnum"
  data-header:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.03em"
  pill:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  pill: "999px"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-neutral:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px"
  nav-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "36px"
  nav-item-hover:
    backgroundColor: "{colors.chip}"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-soft-text}"
  sidebar:
    backgroundColor: "{colors.surface}"
    width: "240px"
  sidebar-collapsed:
    width: "64px"
  status-pill:
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  table-header:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.muted}"
    typography: "{typography.data-header}"
  table-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    padding: "11px 12px"
---

# Design System: AgroReport (DB Inspector)

## Overview

**Creative North Star: "A Bancada de Dados"**

Uma bancada de trabalho para quem le banco de dados o dia inteiro: superficies neutras e frias, uma unica cor de acao (azul) e o resto do peso visual entregue aos dados. A tela e densa de proposito. Texto de 12 a 13px domina, espacamentos andam em passos de 4 a 12px e as tabelas de resultado ocupam o centro de quase toda pagina.

O sistema existe em dois temas com os mesmos papeis. O tema claro fica em `:root` e o escuro em `.dark-theme` (aplicada no `body` e no container de overlay do CDK), ambos em `src/tokens.css`, o unico arquivo com cor literal. Os componentes so falam em papeis: `var(--...)` em CSS ou as classes Tailwind expostas por `@theme inline` em `src/styles.css` (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`, `bg-warning-soft`...). O Angular Material (tema azure em `src/custom-theme.scss`) segue o tema por `color-scheme`.

Profundidade vem de camadas tonais e bordas finas, nao de sombra. Sombra aparece so em coisas que flutuam (menus, paineis de overlay, modais).

**Key Characteristics:**
- Densidade alta: corpo de 14px, dados em 12px com numeros tabulares, rotulos em 12px.
- Um azul de acao; estados (sucesso, aviso, informacao, divergencia, perigo) como texto mais fundo tingido a 12%.
- Superficies planas separadas por borda de 1px e por troca de tom (pagina, superficie, superficie alternativa).
- Navegacao lateral fixa; sem barra de topo quando logado.
- Dois temas com contraste WCAG verificado em teste (`src/app/theme-tokens.spec.ts`).

## Colors

Neutros frios com leve tom azulado, um azul de acao saturado e cinco cores de estado usadas como texto e como base de fundos tingidos.

### Primary
- **Azul de Acao** (accent / accent-dark): o azul de FUNDO de botao principal, selecao, anel de foco (`outline 2px`), `accent-color` de checkboxes e marcador de linha ativa. Texto em cima dele e sempre `on-accent` (branco). No codigo e o token `--chip-bg-active`; os aliases legados `--brand`, `--brand-primary`, `--color-primary` e `--chip-border-active` apontam para ele.
- **Azul de Leitura** (accent-soft-text / accent-soft-text-dark): o azul para TEXTO e links sobre superficie, e o texto do item ativo da navegacao. Mais escuro que o azul de acao no tema claro e bem mais claro no escuro, para passar contraste de texto.
- **Nevoa Azul** (accent-soft / accent-soft-dark): fundo do item ativo da navegacao e da selecao de texto.

### Neutral
- **Pagina** (page): o fundo atras de tudo, inclusive da area principal.
- **Superficie** (surface): cartoes, barra lateral, linhas de tabela, menus e paineis de overlay.
- **Superficie Alternativa** (surface-alt): campos de entrada, botao neutro, cabecalho de tabela, faixas secundarias.
- **Fio** (line): a borda padrao de 1px em cartoes, campos, tabelas e divisores.
- **Fio Forte** (line-strong): bordas que precisam ser percebidas como controle (contornos de selecao, marcas).
- **Tinta** (ink): texto principal.
- **Grafite** (muted): texto secundario, rotulos, cabecalhos de coluna, icones de navegacao, placeholder.
- **Chip** (chip): hover de item de navegacao, de linha de tabela Material e de botao fantasma; fundo de chips.
- **Rolagem** (scroll-track, scroll-thumb): trilho e alca das barras de rolagem finas.
- **Veu** (backdrop): fundo translucido atras de modais.
- **Fundo de Codigo** (code-bg): fundo do editor Monaco, que usa tema escuro fixo nos dois temas do app.

### Estados
- **Sucesso** (success), **Aviso** (warning), **Informacao** (info), **Divergencia** (attention), **Perigo** (danger): cor de texto do estado e base de fundo via `color-mix(in srgb, var(--x) 12%, transparent)`, com borda opcional a 24%. `attention` marca diferencas entre fontes nas comparacoes; `danger` tambem e o tom do botao destrutivo.
- **Aviso Suave** (warning-soft + warning-soft-text): par pronto para faixas de aviso que precisam de fundo opaco.

### Named Rules
**The Single Source Rule.** Nenhuma cor literal fora de `src/tokens.css`. `npm run check:colors` trava em 0; cor nova entra como token nos dois temas ou nao entra.

**The Two Blues Rule.** Azul de fundo (accent) nunca vira cor de texto sobre superficie, e azul de texto (accent-soft-text) nunca vira fundo de botao. Cada par tem contraste conferido em `theme-tokens.spec.ts`.

**The Tint Not Fill Rule.** Estados aparecem como texto colorido sobre fundo tingido (12% e o padrao). Fundo de estado saturado com texto branco nao existe neste sistema.

## Typography

**Body Font:** system-ui (com -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)

**Character:** Uma unica familia do sistema operacional para tudo, inclusive titulos (os `h1`-`h6` e as classes `mat-h*` herdam a fonte do corpo). Hierarquia vem de peso e de poucos pixels de tamanho, nao de contraste de familia. Nao ha papel de display: e uma ferramenta, nao uma pagina editorial.

### Hierarchy
- **Headline** (700, 22px): titulo de pagina (`h1`).
- **Title** (600, 18px): titulo de secao e nome do app na barra lateral (`h2`).
- **Subtitle** (600, 15px): subtitulo de bloco (`h3`).
- **Body** (400, 14px, 20px): texto corrido, vindo do `body-medium` do Material com a familia trocada para system-ui.
- **Body small** (400, 13px): itens de menu, textos auxiliares, estados vazios, filhos da navegacao.
- **Data** (400, 12px, 1.35, numeros tabulares): celulas das tabelas de resultado.
- **Data header** (700, 13px, 0.01em, numeros tabulares): cabecalhos de coluna.
- **Label** (600, 12px, 0.03em, cor muted, sentence case): rotulos de campo.
- **Pill** (600, 11px): pilulas de estado e de tipo.

### Named Rules
**The Tabular Rule.** Toda tabela de resultado usa `font-variant-numeric: tabular-nums` para que numeros alinhem por coluna.

**The Sentence Case Rule.** Rotulos, titulos e botoes em sentence case. Sem caixa alta espacada.

## Layout

Shell de duas colunas em `src/app/app.html`: barra lateral fixa de 240px (64px recolhida, transicao de 0.2s) com area principal flexivel ao lado, ambas com altura de viewport. Logado nao existe barra de topo; o conteudo comeca no alto da area principal com respiro de 16px sobre o fundo de pagina. A barra lateral tem tres faixas: topo (nome e acoes), menu rolavel e rodape com usuario e acoes, separado por fio.

O ritmo de espacamento e curto e quase todo em pixels: 8px e o gap mais comum, depois 6, 10, 12 e 4. Barras de ferramenta usam linha flexivel com quebra e gap de 10px; secoes de cartao, padding de 12px. Breakpoints sao locais por componente, nao um sistema global; os recorrentes sao 900px (empilhar colunas) e 1200px.

## Elevation & Depth

Plano por padrao. Profundidade e tonal: pagina, superficie e superficie alternativa empilhadas, separadas por borda de 1px. A unica sombra de elevacao do sistema e `--shadow-overlay`, usada em menus, listas suspensas, paineis de overlay e modais. Modais ficam sobre o veu (`backdrop`); a superficie de dialogo do Material e zerada e cada modal desenha seu proprio cartao.

### Shadow Vocabulary
- **Overlay** (`--shadow-overlay`, valor por tema em `tokens.css`): tudo que flutua sobre a pagina. Nada no fluxo normal recebe sombra.
- **Anel de foco tingido** (`0 0 0 3px` do azul de acao a 20%): foco de alguns controles customizados, alem do `outline` padrao.

### Named Rules
**The Float Only Rule.** Sombra so em elemento que flutua. Cartao, tabela e barra lateral ficam planos com borda.

## Shapes

Cantos suaves e pequenos, crescendo com o tamanho do elemento: 6px em itens miudos e alcas, 8px em itens de navegacao e botoes so com icone, 10px em botoes, campos e menus, 12px em cartoes. Pilulas e avatares sao totalmente arredondados (999px). Bordas sao sempre de 1px, solidas; tracejado so para zonas de soltar e divisores de variaveis.

## Components

### Buttons
Componente compartilhado `app-button` (`src/app/components/shared/app-button`); use-o em vez de botao cru.
- **Shape:** cantos de 10px, borda de 1px, peso 600, gap de 6px entre icone e texto.
- **Tamanhos:** md com 36px de altura, 14px de padding lateral e texto de 14px; sm com 32px, 10px e 12px. Icone de 18px (md) ou 16px (sm), a esquerda ou a direita.
- **Primary solid:** fundo e borda no azul de acao, texto `on-accent`; hover clareia (`brightness 105%`).
- **Neutral outline (padrao):** fundo superficie alternativa, borda fio, texto tinta; hover mistura 24% do azul de acao no fundo.
- **Neutral ghost:** transparente, texto muted; hover vai para fundo chip e texto tinta.
- **Danger outline:** fundo de perigo a 5%, borda a 45%, texto perigo; hover a 10%.
- **Estados comuns:** foco com `outline` de 2px no azul de acao, offset 1px; pressionado escurece (`brightness 95%`); desabilitado com opacidade 0.55.
- So essas quatro combinacoes de tom e variante tem estilo proprio; as demais caem no visual neutral outline.

### Chips e pilulas
- **Pilula de estado:** 999px, padding 3px 8px, texto de 11px na cor do estado, fundo do estado a 12% e borda a 24%.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** superficie.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** 1px fio.
- **Internal Padding:** 12px.

### Inputs / Fields
- **Style:** fundo superficie alternativa, borda 1px fio, cantos de 10px, altura minima de 36px, padding lateral de 10px; textarea com 80px minimos e redimensionamento vertical. Placeholder em muted.
- **Focus:** `outline` de 2px no azul de acao com offset de 1px.
- **Label:** papel Label, acima do campo.

### Navigation
- **Barra lateral:** fundo superficie, fio a direita, 240px (64px recolhida).
- **Item:** 36px de altura (32px e texto de 13px para filhos, recuados 12px), cantos de 8px, peso 500, texto tinta, icone muted.
- **Hover:** fundo chip.
- **Ativo:** fundo nevoa azul, texto e icone no azul de leitura, peso 600, sem borda.

### Tabela de resultado
O componente que mais aparece (`src/app/components/shared/result-table`). Cabecalho em superficie alternativa com texto muted e fio inferior; celulas de 12px com padding de 11px 12px e numeros tabulares; linhas separadas so por fio inferior; hover de linha tinge com superficie alternativa. Em comparacoes, a celula divergente recebe fundo de divergencia tingido, peso forte e um marcador interno de 3px na cor de divergencia a esquerda; celula ausente usa o tingido de aviso. O mesmo marcador de 3px indica linha de chave primaria e estrangeira e item ativo na arvore de relatorios.

### Modais
Cartao proprio sobre o veu, com sombra de overlay. Menus e listas suspensas do CDK usam superficie, fio de 1px, cantos de 10px e itens de 34 a 36px com texto de 13px.

## Do's and Don'ts

### Do:
- **Do** usar so papeis: `var(--token)` ou as classes `bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent` e afins.
- **Do** colocar texto `on-accent` sobre o azul de acao e usar o azul de leitura (`accent-soft-text`) para texto e links azuis.
- **Do** desenhar estados como texto na cor do estado sobre `color-mix(in srgb, var(--x) 12%, transparent)`.
- **Do** definir todo token novo nos dois temas e cobrir o par de contraste em `theme-tokens.spec.ts`.
- **Do** usar `app-button` com tom e variante existentes antes de criar botao novo.
- **Do** usar numeros tabulares em qualquer tabela de dados.

### Don't:
- **Don't** escrever cor literal (hex, rgb, nome) fora de `src/tokens.css`; `npm run check:colors` falha.
- **Don't** usar o azul de acao como cor de texto ou o azul de leitura como fundo de botao.
- **Don't** colocar sombra em cartao, tabela ou barra lateral; sombra e so para o que flutua.
- **Don't** escrever rotulos em caixa alta espacada; use sentence case.
- **Don't** trocar o fundo do editor Monaco pelo tema do app; `code-bg` e fixo.
- **Don't** adicionar barra de topo ao shell logado.
