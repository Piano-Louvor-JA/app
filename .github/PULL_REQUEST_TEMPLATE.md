> Revisor: aplique o método e as severidades de [`.github/REVIEW-RUBRIC.md`](.github/REVIEW-RUBRIC.md).

## Resumo
<!-- O que mudou e por quê? (2-3 frases, sem clichê de LLM) -->

## Tipo
- [ ] Correção
- [ ] Feature
- [ ] Refactor
- [ ] Documentação
- [ ] CI / infraestrutura
- [ ] Segurança

## Evidência de Regressão (OBRIGATÓRIO — anti-regressão)
<!-- O agente DEVE preencher ANTES de pedir review. PR sem esta seção = bloqueado. -->

### Baseline (antes da 1ª edição)
- `npm run test:regression -- --baseline` rodado: **SIM / NÃO**
- Testes passing: **X / Y**
- Type-check (`vue-tsc --build`): **OK / FALHOU**
- Build (`npm run build`): **OK / FALHOU**

### Pós-mudança (após implementação)
- `npm run test:regression -- --compare` rodado: **SIM / NÃO**
- Testes passing: **X / Y** (deve ser ≥ baseline)
- Type-check: **OK / FALHOU**
- Build: **OK / FALHOU**

### Anel de regressão — consumidores verificados
- [ ] Módulos que importam arquivos tocados (grep imports reversos)
- [ ] `src/shared/` composables/services/stores modificados? Quais consumidores:
- [ ] Paridade web/app/APK afetada? (types, `.ja`/`.slja`, WS protocolo)

## Validação
- [ ] Testes novos/atualizados cobrem a mudança (TDD: RED → GREEN)
- [ ] Analyze/lint/typecheck passam
- [ ] Build relevante passa
- [ ] Fluxo manual foi testado quando há UI
- [ ] Sem segredo, credencial ou dado pessoal no diff

## Evidência
<!-- Comando rodado + saída (testes, type-check, build). Ex.: "278/278 testes, vue-tsc limpo, build OK" -->

## Risco / rollback
<!-- Impacto, compatibilidade e como reverter; ou N/A. -->

Closes #