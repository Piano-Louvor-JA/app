# GAUNTLET-STATE — PIANO Palco Roku v1

## Metadados
- Loop iniciado: 2026-11-20
- BARRA congelada: SPEC-v1.0.0 / PLAN.md no Obsidian
- Workspace: `/media/rafaelejosi/Dados/repos/piano-app/.worktrees/t_ec38e001`
- PR alvo: `staging`, abrir somente após QA/review local
- Critério global: build, testes de protocolo/estado, pacote ZIP/checksum verdes; teste Roku físico explicitamente pendente
- Autonomia: usuário autorizou DAG inteira sem subagentes; execução local em gauntlet loop

## Barra
- B1/RF-001: receiver isolado `roku-palco/`; Roku OS 16+; sem alteração sender.
- B2/RF-002: Registry host/porta/token; token jamais renderizado/logado.
- B3/RF-003: `roWebSocket` somente em `Task`; endpoint `/palco`, token opcional; retries 1/2/4/8/15.
- B4/RF-004: parser seguro aceita v1/v2 e sete tipos; entradas inválidas ignoradas.
- B5/RF-005: reducer/UI para projection/bgPalco/idle/youare/timer/audio/video; desconexão para mídia.
- B6/RF-006: lint/compilação, testes, ZIP reproduzível e SHA-256.
- B7/RF-007: clean-room SaimoRoku: zero reuso literal.
- B8/RF-008: QA de socket/mídia em Roku físico OS 16+ — bloqueio externo; não alegar execução.

## Estado atual
- Peça: P4 QA/review local
- Ciclo: 1
- Última ação: build, 9 testes, pacote ZIP reproduzível e push validados; commits `a38578a7`, `5e27a2a8`.
- Próximo comando: criar PR para `staging` após registrar QA/review no Kanban; Roku físico permanece pendente.
- Decisões assumidas: testes BrightScript executáveis por Node harness para parser/reducer puros; Roku físico pendente.

## Log
| Peça | Ciclo | Papel | Resultado | Evidência |
|---|---:|---|---|---|
| P0 baseline | 1 | líder | PASSOU | worktree limpa; SPEC/ADR/PLAN lidos; SaimoRoku apenas referência |
| P1–P4 builder/QA | 1 | líder | PASSOU | `npm test` 9/9; `npm run lint` exit 0; ZIP `unzip -t` OK; dois builds byte-idênticos SHA-256 `07fb111bba11e7d8a02c2ba924c87d034d017b5e7aae29a9fa5e102b97110aaf`; clean-room grep 0 |

## Peças
| Peça | Status | Ciclos | Evidência |
|---|---|---:|---|
| P0 baseline | PASSOU | 1 | SPEC/ADR/PLAN + worktree limpa |
| P1 estrutura + protocolo | PASSOU | 1 | parser/estado 9/9 |
| P2 Task + Registry | PASSOU | 1 | `roWebSocket`, Registry, retry |
| P3 SceneGraph + mídia | PASSOU estático | 1 | SceneGraph e stop de mídia em disconnect |
| P4 pacote + QA local | PASSOU | 1 | lint, ZIP válido/reproduzível, SHA-256 |
| P5 review/release local | running | 1 | push confirmado; PR pendente |

## Bloqueios externos
| Bloqueio | Tipo | Status |
|---|---|---|
| Roku físico OS 16+ para WS/LAN/mídia | device | pendente; não bloqueia implementação/local QA |
