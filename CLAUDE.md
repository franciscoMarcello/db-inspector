# CLAUDE.md — DB Inspector UI (Frontend)

## Sobre o projeto

DB Inspector UI é o frontend do portal de BI interno. Permite explorar metadados do banco, executar queries SQL com editor Monaco, gerenciar relatórios parametrizados com exportacao PDF/Excel, agendar envios por email e administrar usuarios/permissoes. Consome a API REST do DB Inspector backend.

## Stack

- Angular 20 (standalone components, signals)
- Angular Material 20 + CDK
- Tailwind CSS 4
- Monaco Editor (editor SQL)
- RxJS 7
- Karma + Jasmine (testes)
- Angular CLI 20 + esbuild
- Prettier (printWidth 100, singleQuote)

## Regras gerais

- Sem emojis em codigo, comentarios ou commits.
- Comentarios somente quando o codigo nao for autoexplicativo.
- Respeite a estrutura de pastas existente. Nao crie pastas ou modulos novos sem necessidade real.
- Nao crie arquivos que nao foram solicitados.
- Antes de criar qualquer componente ou service, analise o padrao ja existente e replique.
- Rode Prettier antes de qualquer commit: printWidth 100, singleQuote.
- Respostas e explicacoes em portugues BR.

## Codigo Angular

- Standalone components exclusivamente. Nao crie NgModules.
- Signals para estado reativo. Prefira signals sobre BehaviorSubject para estado local.
- RxJS para fluxos HTTP e operacoes assincronas complexas. Nao force signals onde RxJS resolve melhor (ex: debounce em busca, combinacao de streams).
- `inject()` ao inves de constructor injection.
- Lazy loading em todas as rotas.
- Nao use `any`. Tipar tudo com interfaces em arquivos dedicados.
- Nomeacao kebab-case: `nome.component.ts`, `nome.service.ts`, `nome.model.ts`.

## Angular Material + Tailwind

- Angular Material 20 para componentes de UI (tabelas, dialogs, forms, menus, snackbars).
- Tailwind CSS 4 para layout, espacamento, responsividade e ajustes visuais.
- Nao recrie componentes que o Material ja oferece. Use `mat-table`, `mat-dialog`, `mat-form-field`, etc.
- Nao crie CSS customizado quando Tailwind resolve. Evite `@apply` salvo em estilos globais.
- Se houver tema customizado do Material, respeite os tokens definidos. Nao sobreescreva com cores hardcoded.
- Responsividade obrigatoria: mobile-first com breakpoints do Tailwind.

## Monaco Editor

- O editor SQL usa Monaco com tema escuro customizado. Nao altere a configuracao do tema sem necessidade.
- Atalhos existentes (Ctrl+Enter para executar) nao devem ser sobrescritos.
- Autocomplete e highlighting customizados — verifique o que ja existe antes de adicionar.
- Monaco e pesado. Nao instancie editores desnecessariamente. Reutilize instancias quando possivel.

## Rotas e permissoes

- Todas as rotas sao protegidas por guards de permissao.
- Permissoes seguem o padrao do backend: `SQL_METADATA_READ`, `SQL_QUERY_EXECUTE`, etc.
- Todo endpoint novo no backend que gere rota nova no frontend precisa de guard correspondente.
- Nao crie rota sem guard. Sem excecao.
- Menus e botoes devem respeitar as permissoes do usuario logado. Esconda o que o usuario nao pode acessar.

## Autenticacao

- JWT com refresh token automatico. A logica ja existe — nao reimplemente.
- Sincronizacao de sessao entre abas ja esta implementada. Nao quebre esse comportamento.
- Interceptor HTTP ja adiciona o token. Nao adicione headers de auth manualmente nos services.
- Tratamento de 401 (token expirado) ja redireciona pro login. Nao duplique essa logica.

## Funcionalidades especificas — cuidados

### Query Runner

- Variaveis SQL usam sintaxe `:nome`. O parser de variaveis ja existe — use-o, nao crie outro.
- Snippets SQL suportam pastas, drag-and-drop, import/export JSON. Respeite a estrutura de dados existente.
- Paginacao e modo "run all" sao modos distintos. Nao misture a logica.
- Exportacao para .xlsx e .sql ja tem services dedicados. Verifique antes de criar novos.

### Relatorios

- Arvore de pastas colapsavel ja tem componente proprio. Reutilize.
- Variaveis de relatorio tem tipos (date, string, number, multi-select com opcoes via SQL). O form builder dinamico ja existe.
- Transferencia de query do Query Runner para relatorio ja tem fluxo. Nao crie caminho alternativo.

### Agendamentos

- Cron expressions sao configuradas como dias + horario. A UI ja abstrai isso — nao exponha cron raw pro usuario.
- Acoes de pausar/retomar/deletar ja tem confirmacao. Mantenha.

### Admin

- Bulk actions (ativar/inativar, trocar role) ja existem. Verifique a implementacao antes de mexer.
- ACL granular por usuario/perfil — a logica e complexa. Entenda o modelo completo antes de alterar.

## HTTP e comunicacao com backend

- Use os services existentes para chamadas HTTP. Nao crie HttpClient calls direto no componente.
- Tratamento de erros centralizado no interceptor. Nao adicione try-catch em cada chamada individual a menos que precise de tratamento especifico.
- Loading states e feedback ao usuario sao obrigatorios em toda operacao assincrona.

## Testes

- Todo componente novo precisa de teste unitario (.spec.ts).
- Todo service novo precisa de teste unitario.
- Use Karma + Jasmine (padrao do projeto).
- Testes de guards de permissao sao criticos — cubra cenarios de acesso negado.
- Rode os testes antes de finalizar: `ng test --watch=false`.

## Commits

- Mensagens em portugues.
- Formato: `tipo: descricao curta`
- Tipos: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`
- Exemplo: `feat: adiciona filtro por tipo de variavel na listagem de relatorios`

## O que NAO fazer

- Nao instale dependencias novas sem perguntar antes.
- Nao altere angular.json, tailwind.config, tsconfig ou configuracoes do Monaco sem necessidade explicita.
- Nao crie componentes wrapper em cima do Angular Material sem justificativa concreta.
- Nao adicione console.log no codigo final.
- Nao reimplemente logica que ja existe (auth, interceptors, parser de variaveis SQL, exportacao).
- Nao quebre a sincronizacao de sessao entre abas.
- Nao crie services que fazem chamadas HTTP direto — passe pelo service existente da feature.
