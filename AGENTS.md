# AGENTS.md — Piano-LouvorJA/app

> Guia para agentes de IA e devs neste repo. Regras da ORG: [`docs/AGENTS.md`](https://github.com/Piano-Louvor-JA/docs/blob/main/AGENTS.md) (contas, convenções, os 10 NUNCA-faça, paridade web↔app↔apk). Este arquivo cobre o que é ESPECÍFICO do app. Em conflito, vale o mais restritivo.

## Stack e comandos

Electron + Vue 3 + Vuetify + Vite, testes com Vitest/Playwright.

| Ação | Comando |
|---|---|
| Dev desktop | `npm run electron:dev` |
| Typecheck (o do build) | `npm run build` (roda `vue-tsc --build` + vite; o `--noEmit` solto NÃO é equivalente) |
| Testes unitários | `npm run test` |
| Regressão completa | `npm run test:regression` |
| Build Linux | `npm run electron:build -- --linux AppImage --x64 --publish never` |
| Build Windows | só via CI (`workflow_dispatch` no build-windows.yml) — portable NUNCA cross-compila |

Node via nvm; `npm ci` (nunca misturar com `npm install` em CI).

## Regras do app

1. **Offline-first é requisito permanente**: dado do usuário (liturgia, downloads, progresso, preferências) sobrevive a reload, fechar app e update. Persistência nova entra com teste de roundtrip save→reload no MESMO commit.
2. **Zero `window.confirm`/`window.alert`** — usar o AppConfirm do design system.
3. **Multi-janela**: cada popup do Electron é renderer SEPARADO (Pinia não compartilha). Estado entre janelas = eleição de host (localStorage) ou evento via main — nunca pressupor memória compartilhada.
4. **Timer por deadline ABSOLUTO** (`Date.now()`), nunca decremento de frames — rAF congela com janela em background.
5. **Player externo** (VLC/mpv) é preferência cross-feature: consumidor novo de mídia lê a MESMA preferência no mesmo commit; falha do externo NUNCA cai em silêncio no interno (`file-missing` tem tratamento próprio).
6. **Electron/asar**: arquivo lido em runtime PRECISA estar fora do .gitignore (electron-builder respeita → ENOENT no asar). Fix só está "entregue" quando greppado DENTRO do `app.asar` do artefato final (string de mensagem/i18n, não símbolo do fonte — minifier renomeia).
7. **Namespace de conteúdo custom**: id custom = id + 1.000.000, mesmo `resolveMediaTrack()` resolve oficial e custom; import é idempotente por hash de conteúdo (sha256 → client_uuid), unique escopado por dono.
8. **Sync v2**: escrita local-first via OUTBOX (coalescing por `namespace::key`, flush em batch que não bloqueia o fluxo local), pull com LWW por `(client_uuid, updated_at_ms)`; empate = skip.
9. **Busca**: tokenização AND-entre-termos, fold diacrítico, `lyric` no índice — padrão em `docs` (product-search).
10. **Login Google no desktop**: popup OAuth passa por allowlist estreita de hosts + COOP strip; dev server SEMPRE em `localhost` (nunca `127.0.0.1` — Firebase casa hostname exato).
11. **Projeção em TV é via WS próprio (StageSession/relay) — Chromecast NÃO existe no projeto.**
12. **Release**: `X-Client-Platform`/`X-Client-Version` em toda request nova de rede; release-note no template de PR alimenta o `/promote`.

## Fluxo de trabalho

- Branch flow: `feat/*|fix/*` → PR para **`staging`** → staging→main. NUNCA direto pra main.
- TDD: teste RED antes do fix; bug fix chega COM o teste que o reproduz.
- Antes de push: `npm run build` + `npm run test` verdes. Gates rodam ANTES do commit, não só antes do push.
- PR pequena e focada; commits atômicos convencionais (`feat:`, `fix:`, `ci:`, `docs:`).
- Paridade com web e apk é COMPORTAMENTAL (mesma experiência, não mesmo código).

## Revisão (para agentes revisores)

- Método e severidades: [`.github/REVIEW-RUBRIC.md`](.github/REVIEW-RUBRIC.md) — aplicar em toda revisão (Codex, pr-agent ou humana).
- A revisão concluída prova conclusão, não ausência de problema: ler os apontamentos ativos.
- Não declarar "CI verde" sem conferir que a suíte de testes rodou (o CI do app tem jobs que só lintam/buildam).
