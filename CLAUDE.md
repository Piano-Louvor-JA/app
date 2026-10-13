# CLAUDE.md — Piano-Louvor-JA/app

App desktop (Electron + Vue 3) do Piano LouvorJA. É a **fonte de referência
de features** do ecossistema: o que nasce aqui precisa de caminho equivalente
no `web` e no `apk`.

Regras e convenções do repo (leitura obrigatória):

@AGENTS.md

Regras da organização: `docs/AGENTS.md` no repo `Piano-Louvor-JA/docs`.

## Comandos

Node 24 (`.nvmrc`; `engines`: `^22.18.0 || >=24.12.0`). Instalar com `npm ci`.

- O npm 11 bloqueia scripts de instalação de dependências que não foram aprovados (esbuild, protobufjs, @parcel/watcher etc.). Não atrapalha os testes nem o typecheck. Se algo nativo falhar, use `npm install-scripts ls`.
- O binário do Electron é baixado na primeira execução.
- O terminal do VS Code exporta `ELECTRON_RUN_AS_NODE=1`. Por isso os scripts usam `env -u ELECTRON_RUN_AS_NODE`. Rode o app sempre pelos scripts npm, nunca com `npx electron` direto.
- `typescript` é um alias para `typescript-native-bridge` (fork baseado no tsgo), em `devDependencies` e `overrides`. Não trocar pelo pacote oficial.

| Ação | Comando |
|---|---|
| Rodar o app (desktop) | `npm run electron:dev` (Vite em `localhost:5173` + Electron) |
| Rodar com DevTools e log | `npm run electron:dev-log` (log em `/tmp/louvorja-dev.log`) |
| Typecheck | `npm run type-check` (`vue-tsc --build`) |
| Typecheck + build web | `npm run build` |
| Testes unitários | `npm run test` |
| Um teste só | `npx vitest run caminho/do/arquivo.test.ts` |
| Cobertura | `npm run test -- --coverage` |
| E2E (Playwright, Chromium) | `npx playwright test` (sobe Vite na porta 5273) |
| Gate de regressão | `npm run test:regression` (`--baseline` / `--compare`) |
| Paridade app↔web | `node scripts/check-paridade.mjs` (precisa de `gh` autenticado) |
| Regenerar client da API | `npm run orval` (a partir de `openapi.json`; commitar o output) |
| Storybook | `npm run storybook` |
| Pacote Linux | `npm run electron:build -- --linux AppImage --x64 --publish never` |

- Não há script `lint` nem `biome.json`: o job de lint do CI só emite aviso. Não apresente "lint OK" como validação.
- Os hooks em `.husky/` (pre-commit: typecheck; pre-push: `test:regression -- --compare`) **não estão ativos**: o husky não é dependência do projeto e não há script `prepare`. Rode as validações manualmente antes do push.
- Build Windows/macOS e publicação acontecem no CI (`.github/workflows/build-*.yml`, `release.yml`). Fluxo de release completo: `docs/DEPLOY.md` (interno, ver abaixo).

## Arquitetura

Dois mundos separados, que se comunicam só por IPC:

- **`electron/`: processo main (Node, ESM `.mjs`).** O ponto de entrada real é `electron/main.mjs`. O `main.ts` é só um stub.
  - `preload.mjs` expõe a bridge `window.louvorja`.
  - `ipc/`: handlers (displays, janelas, diálogos, apresentações PPT/PDF, probe de mídia, projeção web).
  - `player/`: HTMLs das janelas de player (vídeo, PDF, PPTX, YouTube, barras de controle).
  - `palco/` + `palco-server.mjs`: receiver e servidor WebSocket do palco (TVs).
  - `remote-server.mjs`: controle remoto pelo celular.
  - `external-player.mjs`: VLC/mpv.
  - `updater.mjs`, `workspace.mjs`, `telemetry.mjs`, `youtube-*.mjs`: auto-update, workspace, telemetria e YouTube.
  - Testes em `electron/__tests__/`.
- **`src/`: renderer (Vue 3 + Vuetify 4 + Pinia + Tailwind v4).**
  - `modules/<feature>/`: cada feature tem `components/`, `composables/`, `services/`, `stores/`, `views/`, `types/`, `locales/`, `routes.ts` e `__tests__/`. Módulos: albums, auth, bible, clock, community, countdown, diagnostics, draw, home, liturgy, media, random, remote, settings, starting, sync, timer.
  - `shared/`: domínio comum.
    - `shared/components/`: inclui o `AppConfirm.vue`.
    - `shared/services/`: `desktop-bridge.ts`, `api-fallback.ts`, `slja.ts`, `user-preferences.ts` e outros.
  - `shared/api-generated/`: client gerado pelo orval. Não editar à mão.
  - `design-system/`: componentes visuais, tokens `--ds-*` e temas.
  - `layouts/`: compõem o design system.
  - `locales/`: pt-BR, en, es. Toda string de UI passa por `$t`.
  - `router/`: agrega os `routes.ts` dos módulos.
- **Aliases:** `@`, `@app`, `@modules`, `@shared`, `@design-system`, `@layouts`, `@plugins`, `@themes`, `@assets`, `@styles`, `@locales` (definidos em `vite.config.ts` e `vitest.config.ts`).

Pontos de atenção:

- No renderer, sempre checar `isDesktopApp()` antes de usar `window.louvorja`. Nunca expor Node no renderer.
- `displayId` (monitor físico, no app) ≠ `slot` (conceito do web).
- Responsividade mobile não é responsabilidade deste repo; ela pertence ao `web`.
- Persistência segue Component → Composable → Store → Preferences Service → storage. Nunca acessar storage direto.
- **Arquivos com paridade obrigatória com o `web`:** `src/modules/bible/types/bible.ts`, `src/modules/bible/services/scripture-format.ts`, `src/modules/bible/services/bible-runtime.ts` e `src/modules/settings/types/stage-settings.ts`. Se alterar algum deles, a mesma mudança precisa ir para o `web`, senão o job `paridade` do CI falha.

## Configuração (`.env`)

As variáveis estão em `.env.example`:
- `VITE_URL_DATABASE`, `VITE_URL_FILES`: base da API.
- `VITE_API_FALLBACK_URLS`: fallbacks separados por vírgula.
- `VITE_PALCO_API_URL`, `PIANO_API_BASE_URL`, `VITE_API_TOKEN`.

Sem `VITE_URL_DATABASE`/`VITE_URL_FILES`/`VITE_API_FALLBACK_URLS`, o app **não falha**: usa as URLs públicas padrão (`DEFAULT_PRIMARY_BASES` e `DEFAULT_FALLBACK_HOSTS` em `src/shared/services/api-fallback.ts`).

- **Não remover esses defaults.** O CI não injeta `VITE_*`, e uma versão "sem default" já quebrou todos os builds de release (app#177).
- **Comportamento da cascata:**
  - 429, 5xx e erro de rede: novas tentativas com backoff na mesma base;
  - qualquer resposta não-OK que sobrar: passa para o próximo host.

Nunca commitar `.env`/`.env.prod` nem copiar seus valores.

## Testes e CI

- Testes Vitest em `__tests__/` ao lado do código, com ambiente jsdom, setup em `vitest.setup.ts` e timeout de 30 s. E2E em `e2e/`.
- Cobertura: o `vitest.config.ts` exige 100%. No CI, a PR para `staging` usa limite de 50% e o resto usa 100%.
- **Jobs do CI (`ci.yml`):**
  - `validate-source`, `lint`, `typecheck`, `coverage`, `build`, `unit-tests`, `paridade`;
  - `regression-gate`, que falha se diminuir o número de testes passando;
  - `e2e-tests`, que não roda em PR para `staging`;
  - `release-validation`, que empacota com as três últimas versões major do Electron;
  - `pr-pre-review` e `quality-gate`, que agregam os demais. O `Quality Gate` é o check obrigatório.
- Há ainda os workflows `codeql.yml`, `security.yml` (gitleaks) e `codex-review-gate.yml`.
- Para provar que um fix chegou ao artefato, faça grep da string (mensagem/i18n) dentro do `app.asar` gerado, não no fonte.

## Documentação do repo

`docs/` (exceto `docs/LEGAL/`) e `.cursor/` estão no `.gitignore` como
material interno, ainda não publicado. Por isso **podem não existir num clone
novo**. Não force a inclusão deles (`git add -f`) nem copie o conteúdo para
arquivos versionados. Quando existirem localmente:

- `docs/INDEX.md`: ordem de leitura e mapa das pastas.
- `docs/planning/`: CONTEXT, PLAN e `specs/SPEC-02..04` (SDD).
- `docs/checklists/sdd-gate.md`: gate antes de codar feature.
- `docs/DEPLOY.md`: versionamento, builds e release.
- `docs/stitch/`: referências visuais das telas.
- `.cursor/rules.md`: regras de código detalhadas (Composition API, Pinia, i18n, Tabler Icons, camadas de persistência).

Versionados:

- `.github/REVIEW-RUBRIC.md`: método de revisão de PR.
- `.github/pull_request_template.md`: template de PR (inclui a release-note).
- `.agents/skills/revisar-prs/SKILL.md`: skill de revisão de PRs.
