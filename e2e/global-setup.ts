// globalSetup do Playwright (app) — guard de URL de produção (G2).
//
// Roda UMA vez antes de qualquer spec/browser/request. Valida as URLs de API
// EFETIVAS: process.env > .env.local > .env (mesma precedência que o dev
// server do Vite/Playwright usa para carregar esses arquivos). Se qualquer
// uma apontar para api.pianolouvorja.com.br, a suíte INTEIRA aborta aqui —
// nenhum request sai para produção (critério A4 da SPEC guardrail-e2e).
//
// Consequência intencional (D8/PLAN): rodar E2E deste app com o .env default
// do .env.example (que aponta para PRODUÇÃO) agora ABORTA. Era exatamente o
// vetor do incidente de 07/10/2026. Para API real, use staging
// (api-stg.pianolouvorja.com.br) no .env.local; o padrão dos specs segue
// sendo mock via page.route.
import { assertNoProdApiUrl, repoRootEnvLayers, resolveEffectiveApiUrls } from './helpers/prod-url-guard'

export default function globalSetup(): void {
  const effective = resolveEffectiveApiUrls(process.env, repoRootEnvLayers())

  // P1-2 (rework): sem NENHUMA env de API explícita, services do app usam
  // defaults hardcoded https://api.pianolouvorja.com.br e requests E2E reais
  // sairiam para PRODUÇÃO. Exigir env explícita (staging/localhost) em E2E.
  if (effective.length === 0) {
    throw new Error(
      'E2E sem env de API explícita — defaults hardcoded dos services apontam para ' +
        'PRODUÇÃO (api.pianolouvorja.com.br). Exporte VITE_URL_DATABASE/VITE_PALCO_API_URL ' +
        'com staging (api-stg.pianolouvorja.com.br) ou localhost (via .env.local, ' +
        'process.env ou CI env), ou use mock (page.route).',
    )
  }

  for (const { key, url, source } of effective) {
    assertNoProdApiUrl([url], `${source} (${key})`)
  }
}
