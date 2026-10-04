# Auditoria de Cobertura — louvorja/app

Gate atual: CI v8 2-passadas + merge (`test-coverage.yml`). Global: 98.39/94.36/97.57/99.07, 92 arquivos com gap.

**Contexto:** v8 e istanbul têm bug de source map em `.vue` (issues vitest#10103, #9868) — marcam como não-executadas linhas que os testes provam executadas. Este documento registra o laudo de cada gap: `REAL` (sem teste que exerça o comportamento → escrever teste) ou `FANTASMA` (teste existe e prova a execução → aguardar fix upstream).

Método do laudo: rodar a spec do arquivo SOLO com v8, extrair linhas mortas, inspecionar o código + os asserts dos testes existentes.

## Laudo por arquivo

| Arquivo | s/b/f | Laudo |
|---|---|---|
| settings/components/AppBackupCard.vue | 94.1/79.6/100.0 | **FANTASMA** — 14 testes cobrem todos os fluxos (cria/cancela/falha/exceção/progresso determinate+indeterminate/restore 4 variantes/unmount); linhas apontadas (24=percent 0, 44=close busy guard) têm asserts passando por elas |
| settings/views/GeneralView.vue | 94.5/80.5/89.5 | **REAL parcial** — fn 139 `handleCheckUpdate` sem teste de clique desktop → FECHADO (teste "clique com desktop chama checkForUpdates", 37/37). stmts 42/49/63/81 = guards de clear/sync com testes passando → FANTASMA |
| media/stores/useMediaStore.ts | 96.4/85.1/97.5 | **REAL parcial fechado** — re-open da mesma faixa com notice visível (br 305) → FECHADO (96/96 no core). 50 brs solo restantes = guards de race (gen!==ondemandGen durante awaits), watch de projeção e listeners de window com comportamento em specs vizinhas; casos extremos de concorrência documentados como não-persecutórios |
| random/services/random-audio.ts | 100/88.5/100 | **FANTASMA** — ended/error/play-reject testados p/ AMBOS draw e efeito (efeito: "toca sem loop ended limpa", "play rejeitado", "erro limpa referência"); brs 125-194 (guards currentAudio/effectAudio === audio) exercitados |
| starting/services/cover-background-sync.ts | 97.6/88.6/100 | **REAL fechado (guard de url)** — url sem path relativo não testada → FECHADO ("url sem marker é ignorada nos dois loops", 14/14, missing=1 assertado). brs 88/111/126/139 = FANTASMA (testes skipIfSynced/missing-0/offline existem e passam) |
| remote/composables/useRemoteControl.ts | 94.6/87.5/94.1 | **REAL fechado** — br 57 (tick do interval com receiver parado → `?? false`) sem teste → FECHADO com fake timers (11/11, brs mortos solo = 0). stmts 60/61 (beforeunload cleanup) = listeners de window, comportamento documentado |
| starting/composables/useAppBootstrap.ts | 94.4/91.7/100 | **REAL fechado (catch)** — erro na sincronização do first boot sem teste → FECHADO ("catch marca erro", 19/19, hasError=true assertado). brs 134/189 + stmts 179-191 continuam "mortos" solo = FANTASMA (o catch executa, o assert prova) |
| albums/services/album-tracks.ts | 99.1/87.9/100 | **REAL fechado (grosso)** — sem spec dedicada; criado `album-tracks-branches.test.ts` (23 testes): formatCatalogDuration (todas variantes), hasInstrumentalFlag (true/1/'1'/url/vazio), linhas inválidas, custom/hymnal paths, fallback numeração, filterAlbumTracks, loadAlbumLyric (HTML strip/objeto/título/fallback), remote fallback + erro. brs mortos solo: 43 → 12 (restantes = residuais de solo/fantasma) |
| media/services/outbox.ts | 98.0/83.3/96.9 | **REAL fechado** — fallback RFC4122 do newClientUuid (crypto sem randomUUID) sem teste → FECHADO (formato v4 válido assertado, 11/11). Demais brs = guards do mock indexedDB / catch com testes passando → FANTASMA |
| shared/composables/useMonitorTargetSelect.ts | 97.0/83.8/100 | **REAL fechado (race)** — guards seq!==syncSeq nunca testados → FECHADO com teste de race real (mudança durante syncToMain aborta etapas seguintes, 19/19). v8 ainda marca [0,12] morto = FANTASMA resididual. brs 54/99/194-207/280/314 com asserts passando → FANTASMA |
| settings/components/ExternalPlayerCard.vue | 96.0/80.9/95.0 | **FANTASMA** — 16 testes cobrem setPlayer success/false/exceção, pick 3 variants, removeCustom 3 variants, chip custom via clique; brs apontados têm asserts passando por eles |
| settings/components/PptEngineCard.vue | 98.5/81.7/100 | **FANTASMA** — 10 testes cobrem setEngine success/false/exceção, custom dialog 3 variants; brs 34/49/74/77 exercitados |
| random/views/RandomProjectionView.vue | 96.6/73.7/93.3 | **REAL parcial fechado** — brs 133/134 (bgImage ternário) sem teste c/ bgImg → FECHADOS (2 testes: bg com imagem + stage.random null). brs 46/145/163 = FANTASMA (ambos os lados exercitados: embedded/não-embedded, mod presente/ausente — asserts passam) |
| remote/views/RemoteControlView.vue | 100/71.4/100 | **FANTASMA** — brs 41/48 são os ternários connected do template; testes "conectado" e "habilitado e conectando" exercitam AMBOS os lados e passam; v8 conta paths [0,3] do compilador de template |
| settings/views/AppearanceView.vue | 100/33.3/100 | **INALCANÇÁVEL por design** — `const SHOW_LYRIC_CUSTOMIZATION = false` (feature flag desligada no produto); o branch true do v-if na linha 48 nunca roda sem mudar código de produto. Laudo: não atacar |
| settings/components/PalcoRouteSelect.vue | 95.6/91.7/83.3 | **FANTASMA** — fn 28 `update` exercitada 2x ("update escreve rota via setPalcoRoute" com setValue + "update via vm"); fn 38 = callback do setInterval 4s (comportamento real mas exigiria fake timers; onMounted refresh testado) |
| albums/views/AlbumCollectionView.vue | 95.7/89.9/91.7 | **REAL parcial fechado** — `goBack` sem teste → FECHADO ("botão voltar navega pra albums"); unmount com toast ativo testado (sem vazamento). Linhas 53-54/77-78/99/200 têm testes passando → FANTASMA |
| liturgy/views/LiturgyWebProjectionView.vue | 94.6/94.7/90.0 | **FANTASMA** — 10 testes cobrem idle/youtube params/url inválida/local-video/storage/referrer; stmts 38/83/95 exercitados por "runtime idle", "referrer meta: cria", BroadcastChannel message |
| settings/components/YoutubeAccountCard.vue | 95.3/92.9/100.0 | **FANTASMA** — 16 testes cobrem login/logout/toggle adblock com catch variants; blocos apontados (51-59 = login body) exercitados por "login atualiza status" e "logout chama ytAuth.logout" |
