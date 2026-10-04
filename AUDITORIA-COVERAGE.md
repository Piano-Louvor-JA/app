# Auditoria de Cobertura — louvorja/app

Gate atual: CI v8 2-passadas + merge (`test-coverage.yml`). Global: 98.39/94.36/97.57/99.07, 92 arquivos com gap.

**Contexto:** v8 e istanbul têm bug de source map em `.vue` (issues vitest#10103, #9868) — marcam como não-executadas linhas que os testes provam executadas. Este documento registra o laudo de cada gap: `REAL` (sem teste que exerça o comportamento → escrever teste) ou `FANTASMA` (teste existe e prova a execução → aguardar fix upstream).

Método do laudo: rodar a spec do arquivo SOLO com v8, extrair linhas mortas, inspecionar o código + os asserts dos testes existentes.

## Laudo por arquivo

| Arquivo | s/b/f | Laudo |
|---|---|---|
| settings/components/AppBackupCard.vue | 94.1/79.6/100.0 | **FANTASMA** — 14 testes cobrem todos os fluxos (cria/cancela/falha/exceção/progresso determinate+indeterminate/restore 4 variantes/unmount); linhas apontadas (24=percent 0, 44=close busy guard) têm asserts passando por elas |
| settings/views/GeneralView.vue | 94.5/80.5/89.5 | **REAL parcial** — fn 139 `handleCheckUpdate` sem teste de clique desktop → FECHADO (teste "clique com desktop chama checkForUpdates", 37/37). stmts 42/49/63/81 = guards de clear/sync com testes passando → FANTASMA |
| settings/components/PalcoRouteSelect.vue | 95.6/91.7/83.3 | **FANTASMA** — fn 28 `update` exercitada 2x ("update escreve rota via setPalcoRoute" com setValue + "update via vm"); fn 38 = callback do setInterval 4s (comportamento real mas exigiria fake timers; onMounted refresh testado) |
| albums/views/AlbumCollectionView.vue | 95.7/89.9/91.7 | **REAL parcial fechado** — `goBack` sem teste → FECHADO ("botão voltar navega pra albums"); unmount com toast ativo testado (sem vazamento). Linhas 53-54/77-78/99/200 têm testes passando → FANTASMA |
| liturgy/views/LiturgyWebProjectionView.vue | 94.6/94.7/90.0 | **FANTASMA** — 10 testes cobrem idle/youtube params/url inválida/local-video/storage/referrer; stmts 38/83/95 exercitados por "runtime idle", "referrer meta: cria", BroadcastChannel message |
| settings/components/YoutubeAccountCard.vue | 95.3/92.9/100.0 | **FANTASMA** — 16 testes cobrem login/logout/toggle adblock com catch variants; blocos apontados (51-59 = login body) exercitados por "login atualiza status" e "logout chama ytAuth.logout" |
