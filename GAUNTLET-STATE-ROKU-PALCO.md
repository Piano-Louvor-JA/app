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
- Peça: P1–P5 Builder local
- Ciclo: 1
- Última ação: worktree limpa validada; SPEC/ADR/PLAN lidos; `npx brighterscript --version` = 0.73.8.
- Próximo comando: criar testes RED e implementação isolada em `roku-palco/`.
- Decisões assumidas: testes BrightScript executáveis por Node harness para parser/reducer puros; Roku físico pendente.

## Log
| Peça | Ciclo | Papel | Resultado | Evidência |
|---|---:|---|---|---|
| P0 baseline | 1 | líder | PASSOU | worktree limpa; SPEC/ADR/PLAN lidos; SaimoRoku apenas referência |

## Peças
| Peça | Status | Ciclos | Evidência |
|---|---|---:|---|
| P0 baseline | PASSOU | 1 | estado acima |
| P1 estrutura + protocolo | running | 1 | — |
| P2 Task + Registry | todo | 0 | — |
| P3 SceneGraph + mídia | todo | 0 | — |
| P4 pacote + QA local | todo | 0 | — |
| P5 review/release local | todo | 0 | — |

## Bloqueios externos
| Bloqueio | Tipo | Status |
|---|---|---|
| Roku físico OS 16+ para WS/LAN/mídia | device | pendente; não bloqueia implementação/local QA |
