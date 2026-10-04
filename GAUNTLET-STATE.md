# GAUNTLET-STATE — Loop de Issues 02/10 (app#337 → apk#106 → app#339 → #338 → orval → sync v2)

> Modo autônomo ativado por Rafael: "fica a seu critério mas faz em loop" + rafael-workflow.
> Board: hermes kanban default. Branch de trabalho: `fix/<issue>-<slug>` a partir de main (feat→staging→main).
> PRs: base staging, review Ezequias antes de merge.

## Ordem do loop (critério: impacto em campo → dependências)
1. [RUNNING] **t_7f36710d — app#337** (import first-boot para ao perder foco)
2. [ ] t_f09e15a4 — apk#106 (réplica título/categoria)
3. [ ] t_f09e15a4→339 — app#339 (idioma não recarrega catálogo)
4. [ ] t_18f218a5 — app#338 (fila de downloads)
5. [ ] t_9d7e1b49 — orval (4 frentes)
6. [ ] t_7b5ba31a → 3fbf5431 → b13b4e6e → 092d9f36 / 7ec0e2ad — sync v2 (DAG)

## Tarefa atual: t_7f36710d (app#337)
### Diagnóstico (já mapeado na issue)
- Bootstrap do catálogo roda na render process (Electron): `bootstrap-service.ts` é sequencial
  all-or-nothing; Chromium throttla rAF/timers de janela em bg → perda de foco congela/abandona.
- Correção desenhada (na issue #337):
  B1. Retomada por arquivo: `bootstrapComplete.files: string[]` — loop pula os já salvos.
  B2. Fetch+write no processo MAIN via IPC (`ipcRenderer.invoke`) — main não sofre throttle.
  B3. `visibilitychange`: ao voltar o foco, verificar e retomar bootstrap incompleto.

### Barra (B1..Bn)
- B1: com downloads interrompidos no meio (simulado), reabrir o app retoma e completa o bootstrap
  sem re-baixar arquivos já salvos (teste unitário do serviço com estado parcial).
- B2: perda de foco DURANTE o bootstrap não aborta o download em andamento (mock de foco/timers).
- B3: `bootstrapComplete` persiste por arquivo; `isBootstrapComplete` só true com todos.
- B4: sem regressão — suite existente do módulo starting/bootstrap verde.

### Fase
- [x] 0. MAPEAR (issue + diagnóstico acima)
- [ ] 4. IMPLEMENTAR (TDD: teste do estado parcial primeiro)
- [ ] 5. VERIFY (7 gates + regressão)
- [ ] 6. RELEASE (PR base staging)

### Log
- 03/10: task claimed, workspace t_7f36710d. GAUNTLET-STATE criado.
