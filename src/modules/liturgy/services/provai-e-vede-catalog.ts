/**
 * Registry oficial das fontes Provai e Vede (PT) / Probad y Ved (ES).
 * SPEC frozen 2026-11-03 (piano-app-provai-multilingual, ADR-01): registry
 * FECHADO com somente as oito URLs auditadas de 2026. Sem geração de slug,
 * inferência de URL ou request a URL provável. Ano/quarter fora do catálogo
 * resolve null — nenhum fallback HTTP silencioso.
 */
export type ProvaiSourceLanguage = 'pt' | 'es'
export type ProvaiQuarter = 1 | 2 | 3 | 4

export interface ProvaiSource {
  language: ProvaiSourceLanguage
  rotationName: 'Provai e Vede' | 'Probad y Ved'
  quarter: ProvaiQuarter
  year: number
  url: string
}

const ROTATION_NAMES: Record<ProvaiSourceLanguage, 'Provai e Vede' | 'Probad y Ved'> = {
  pt: 'Provai e Vede',
  es: 'Probad y Ved',
}

/** URLs auditadas (HTTP 200, 13 MP4s) — slugs ES literais, inclusive irregulares. */
const PROVAI_SOURCES_2026: ProvaiSource[] = [
  { language: 'pt', quarter: 1, url: 'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-1o-trimestre' },
  { language: 'pt', quarter: 2, url: 'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-2o-trimestre' },
  { language: 'pt', quarter: 3, url: 'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-3o-trimestre' },
  { language: 'pt', quarter: 4, url: 'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-4o-trimestre' },
  { language: 'es', quarter: 1, url: 'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-1er-trimestre/' },
  { language: 'es', quarter: 2, url: 'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-2do-2026-trimestre/' },
  { language: 'es', quarter: 3, url: 'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-3do-2026-trimestre/' },
  { language: 'es', quarter: 4, url: 'https://downloads.adventistas.org/es/mayordomia-cristiana/video/probad-y-ved-2026-4er-2026-trimestre/' },
].map((s) => ({ ...s, year: 2026, rotationName: ROTATION_NAMES[s.language] }))

export { PROVAI_SOURCES_2026 }

export function resolveProvaiSource({
  language,
  year,
  quarter,
}: {
  language: ProvaiSourceLanguage
  year: number
  quarter: number
}): ProvaiSource | null {
  if (year !== 2026) return null
  if (quarter < 1 || quarter > 4) return null
  return (
    PROVAI_SOURCES_2026.find((s) => s.language === language && s.quarter === quarter) ?? null
  )
}

/**
 * Idioma padrão da edição ao abrir o diálogo (ADR-02): es* → es; pt-BR, en,
 * fr, vazio ou desconhecido → pt. EN/FR são fallback PT explícito (DSA não
 * publica fonte oficial nesses idiomas).
 */
export function resolveDefaultProvaiLanguage(appLocale: string): ProvaiSourceLanguage {
  return appLocale.toLowerCase().startsWith('es') ? 'es' : 'pt'
}
