# REVIEW-RUBRIC.md — método de revisão (app + referência da org)

> Aplicado por TODO revisor deste repo — Codex (native review + gate), pr-agent e humano. Fonte única: mudou aqui, muda pra todos.

## Método (nesta ordem, pensando antes de escrever)

1. **INTENÇÃO** — leia a descrição da PR e os títulos dos commits. Resuma em 1 frase o problema que a PR diz resolver. Descrição e código contando histórias diferentes = **finding #1**.
2. **IMPACTO** — liste os módulos/serviços tocados pelo diff. Para cada um, um risco de regressão específico pro usuário de HOJE (não teórico).
3. **FLUXO DE DADO** — acompanhe o dado novo de onde ENTRA até onde PERSISTE (store, disco, IndexedDB, API). Dado de usuário que não sobrevive a reload/background/update = **crítico** (regra offline-first do AGENTS.md).
4. **CETICISMO** — não confie na claim do autor. Pergunte "como eu PROVARIA que isso funciona?" Se a prova é um teste que não existe no diff, o finding prescreve o TESTE EXATO: arquivo, casos, asserção.
5. **ERROS** — rastreie cada catch/promise novo: propagado, logado ou engolido? Engolido = finding com arquivo:linha.
6. **PARIDADE** — mudança visível ao usuário precisa do caminho equivalente em web ↔ app ↔ apk (comportamental, não de código).
7. **ESTILO** — só por último, e nunca reformatting de código pré-existente junto com feature.

## Severidades

| Nível | Critério | Exemplos neste repo |
|---|---|---|
| **CRÍTICO** | Quebra requisito permanente ou perde dado do usuário | offline-first violado; persistência nova sem roundtrip; erro engolido em fluxo de sync; `window.confirm` |
| **ALTO** | Regressão provável em fluxo existente | preferência de player não lida em consumidor novo; timer por frames; estado entre janelas pressuposto |
| **MÉDIO** | Débito claro com risco futuro | teste que não exercita o código real; migration assumida no deploy; release-note faltando |
| **NIT** | Estilo/naming | só se guideline escrita |

## Formato do output

- Findings ordenados CRÍTICO → ALTO → MÉDIO → NIT.
- Cada finding: `arquivo:linha` + por quê (citar a regra violada do AGENTS.md quando houver) + correção sugerida.
- Nada encontrado real = dizer O QUE foi verificado e por quê parece seguro. **Nunca inventar problema pra justificar presença.**
- Nunca declarar "aprovado pela IA" — revisão conclui, humano aprova.

## Orçamento (o gargalo é repetição, não profundidade)

- 1 revisão por SHA **final** (testes verdes antes de pedir). Review de WIP é desperdício — a app#334 gastou 20 revisões (~5h de cota) em commits intermediários.
- Máximo 2 ciclos review→correção→review por PR.
- Diff > 30 arquivos ou > 3.000 linhas: não revisar em loop — pedir divisão ou confirmação.
