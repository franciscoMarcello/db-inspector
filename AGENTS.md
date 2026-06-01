# AGENTS.md

## Escopo rapido
- Repo de app unica Angular 20 (`db-inspector-ui`), sem monorepo/packages internos.
- Entrada real: `src/main.ts` (nao usa `app.config.ts` no bootstrap atual).
- Rotas em `src/app/app.routes.ts` usam componentes standalone com `component:` direto (sem lazy loading hoje).

## Comandos que importam
- Instalar deps: `npm install`
- Dev server: `npm start` (alias de `ng serve`, default em `http://localhost:4200`)
- Build prod: `npm run build` (usa config `production` do `angular.json`)
- Build watch dev: `npm run watch`
- Testes: `npm test` (watch); para CI/local rapido use `npx ng test --watch=false`
- Teste focado: `npx ng test --watch=false --include src/app/.../arquivo.spec.ts`

## Arquitetura e pontos de integracao
- HTTP global em `src/main.ts` com interceptors nesta ordem: `authInterceptor`, depois `envHeadersInterceptor`.
- Base da API vem de `EnvStorageService` (`window.__AGROREPORT_CONFIG__.apiBase` -> meta tag -> fallback localhost `/api/db`).
- Container Docker injeta `runtime-config.js` via `entrypoint-config.sh` usando `API_BASE`.
- Monaco e provido globalmente em `src/main.ts` via CDN (`provideMonacoEditor`).

## Guardas e permissoes
- Toda navegacao de feature passa por guards em `src/app/app.routes.ts` e `src/app/guards/*.ts`.
- Ao criar rota nova, manter guard de permissao coerente com backend (padrao `SQL_*`, `REPORT_*`, `EMAIL_*`).
- Menus e exibicao de acoes dependem de `AuthService.hasPermission()`/`isAdmin()`; nao duplicar regra local divergente.

## Convencoes do repositorio (alto impacto)
- Seguir `CLAUDE.md`: respostas em pt-BR, sem `any`, preferir `inject()` e estado local com signals.
- Nao reimplementar auth/refresh/401/interceptors; a base ja esta em `src/app/services/auth.service.ts` e interceptors.
- Nao instalar dependencias novas nem mexer em configs globais (`angular.json`, `tsconfig*`, tema Monaco/Tailwind) sem pedido explicito.
- Formatar com Prettier do repo (single quote, `printWidth: 100`).

## Diretrizes de UI (Tailwind + reuso)
- Em novas funcionalidades de UI, sempre seguir esta ordem de decisao antes de criar codigo novo:
  1) Reutilizar componente existente da base (ex.: `app-button`, `app-reports-multi-select`, `ui-*`).
  2) Resolver com classes Tailwind no template.
  3) Reutilizar classe global existente em `src/styles.css`.
  4) Criar CSS local apenas para comportamento/visual especifico da feature.
  5) Criar novo componente somente se houver justificativa real de reuso/complexidade.

- Nao criar componente novo por padrao. Criar apenas quando pelo menos um criterio for verdadeiro:
  - Reuso previsto em 2+ telas/fluxos.
  - Comportamento complexo (estado proprio, acessibilidade, teclado, menu/painel, etc.).
  - Encapsulamento necessario para evitar duplicacao relevante.

- Tailwind deve ser a primeira opcao para layout, espacamento, responsividade e estados visuais simples.
- Evitar CSS custom quando Tailwind ou classes globais existentes resolvem.
- Evitar `@apply` em CSS de feature; usar apenas em estilos globais quando fizer sentido.

## Checklist obrigatorio para mudancas de UI
- Antes de finalizar uma feature de UI, validar e registrar de forma objetiva:
  - Componente existente foi avaliado para reuso.
  - Motivo para nao reutilizar (quando aplicavel).
  - Decisao Tailwind vs CSS local (curta e objetiva).
  - Acessibilidade basica (foco visivel, teclado e `aria-*` quando aplicavel).
  - Build verde (`npm run build`).
