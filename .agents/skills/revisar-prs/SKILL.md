---
name: revisar-prs
description: Revisar qualquer PR do Piano-LouvorJA pelo padrão da app#332 — verifica, corrige o mínimo, reprova com o teste exato e declara pronta pra merge só com evidência executada.
---

# Revisar PRs — padrão app#332

A PR de referência ([app#332](https://github.com/Piano-Louvor-JA/app/pull/332)) passou **28/28 checks incluindo Codex Review** porque era: 1 arquivo, +362 linhas, 4 commits, teste E2E que prova o requisito permanente (persistence pós-reload), descrição com resumo + plano de teste executado. Este padrão vale pra toda PR da org.

## Comandos

- `/reviewPR <repo>#<N>` — ciclo completo: auditar → corrigir o mínimo → re-verificar → declarar pronta.
- `/statusPR <repo>#<N>` — somente leitura, estado fresco.

Escopo: repositórios da org `Piano-Louvor-JA`. Base de destino: **staging** (nunca main direto).

## O checklist da #332 (o que "passa" significa)

1. **Escopo pequeno**: 1 concern por PR. Diff > 30 arquivos ou > 3.000 linhas = dividir ANTES de revisar (propor os cortes, não revisar o monólito).
2. **Prova permanente no diff**: toda PR de feature/fix carrega o teste que prova o requisito que ela toca (offline-first → teste de reload; paridade → teste dos 2 lados; sync → roundtrip). "Funciona na minha máquina" não é prova.
3. **Template preenchido**: Resumo + Evidência de Regressão (baseline E pós-mudança com números) + risco/rollback. Seção vazia = PR bloqueada antes de qualquer review.
4. **Gates na ordem**: lint → typecheck → unit → E2E → build → regression-gate → quality-gate, com os NAMES canônicos da org. Verde no check errado não conta.
5. **Codex Review Complete no SHA do head** — não do commit anterior. Review concluída prova conclusão, não ausência de problema: ler os apontamentos.
6. **Zero threads abertas, base atualizada** (`mergeStateStatus` != BEHIND/DIRTY).

## Ciclo de revisão (pra toda PR, nesta ordem)

1. **Estado fresco** via `gh`: mergeState, checks com nome e conclusão, threads, reviews do SHA atual, diff (`git diff origin/staging...HEAD --stat`).
2. **Baseline antes de culpar a PR**: suíte falhou? Worktree do SHA da staging (`git worktree add /tmp/base-<n> origin/staging` + `npm ci`) e rodar o MESMO teste lá. Falha igual na base = débito pré-existente — registrar comentário na PR com a prova e seguir; falha só na branch = regressão, ir pro passo 3.
3. **Flake comprovado** (teste passa isolado, falha na suíte): re-run do job UMA vez e anotar o padrão na PR. Segunda falha = tratar como real.
4. **Finding real**: corrigir o MÍNIMO na branch da PR (checkout isolado, nunca force-push), rodar os testes afetados + typecheck + build, push único. Nunca "sugerir" o que pode simplesmente consertar.
5. **Revisar de novo o SHA novo** (1x). Máximo 2 ciclos; 45 min sem progresso = parar e reportar bloqueio com o que falta.
6. **Prontidão**: todos os checks obrigatórios verdes + threads resolvidas + base atualizada + review do Codex no head → comentário único: **"PR #N — [classificação]: tudo validado; pode mergear em staging."** Qualquer coisa faltando = dizer exatamente O QUÊ falta, nunca "quase pronto".

## Severidades (achados de review)

| Nível | Critério | Exemplos |
|---|---|---|
| CRÍTICO | perde dado do usuário ou viola requisito permanente | offline-first violado; persistência sem roundtrip; erro engolido em sync; `window.confirm` |
| ALTO | regressão provável em fluxo existente | paridade quebrada; timer por frames; estado entre janelas pressuposto |
| MÉDIO | débito com risco futuro | teste que não exercita código real; migration assumida; release-note faltando |
| NIT | estilo | só com guideline escrita |

Formato do finding: `arquivo:linha` + por quê (citar a regra) + correção concreta. Nada encontrado = declarar O QUE foi verificado; **nunca inventar problema**.

## Limites

Nunca mergear, aprovar formalmente, force-push, retargetar, fechar ou alterar proteções. Aprovação formal é do Ezequias/humano. Não executar código do PR com credencial de escrita. Decisão ambígua (segurança, dados, cobrança, migração) = registrar e parar.

## Referências

- Regras do repo: `AGENTS.md` na raiz; regras da org: `docs/AGENTS.md`.
- Método e severidades: `.github/REVIEW-RUBRIC.md`.
- Gate nativo: `codex-review-gate.yml` (check `Codex Review Complete` vermelho com CI verde = timeout de review: `@codex review` de novo).
