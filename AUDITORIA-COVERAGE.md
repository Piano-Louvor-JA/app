# Auditoria de Cobertura — louvorja/app

Gate atual: CI v8 2-passadas + merge (`test-coverage.yml`). Global: 98.39/94.36/97.57/99.07, 92 arquivos com gap.

**Contexto:** v8 e istanbul têm bug de source map em `.vue` (issues vitest#10103, #9868) — marcam como não-executadas linhas que os testes provam executadas. Este documento registra o laudo de cada gap: `REAL` (sem teste que exerça o comportamento → escrever teste) ou `FANTASMA` (teste existe e prova a execução → aguardar fix upstream).

Método do laudo: rodar a spec do arquivo SOLO com v8, extrair linhas mortas, inspecionar o código + os asserts dos testes existentes.

## Laudo por arquivo

| Arquivo | s/b/f | Laudo |
|---|---|---|
| settings/components/AppBackupCard.vue | 94.1/79.6/100.0 | **FANTASMA** — 14 testes cobrem todos os fluxos (cria/cancela/falha/exceção/progresso determinate+indeterminate/restore 4 variantes/unmount); linhas apontadas (24=percent 0, 44=close busy guard) têm asserts passando por elas |
| settings/components/YoutubeAccountCard.vue | 95.3/92.9/100.0 | **FANTASMA** — 16 testes cobrem login/logout/toggle adblock com catch variants; blocos apontados (51-59 = login body) exercitados por "login atualiza status" e "logout chama ytAuth.logout" |
