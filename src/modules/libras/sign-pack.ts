/**
 * sign-pack — formato .spack (SPEC-libras-v2.0.0 F1.1)
 * Dicionário comunitário de língua de sinais: glossário (termo → sinais),
 * metadados (locale/licença/atribuição) e vídeos por sinal.
 * Sem deps externas; parse síncrono de manifest já descompactado (zip via caller).
 */

export interface SignVideoRef { url: string; size: number }
export interface SignEntry { signs: string[]; fingerspelling: boolean; video?: SignVideoRef }
export interface SignPack {
  locale: string
  version: string
  license: string
  attribution: string
  grammar: { wordOrder?: string }
  glossary: Map<string, SignEntry>
}

export interface RawEntry { signs?: string[]; fingerspelling?: boolean; video?: SignVideoRef }
export interface RawPack {
  locale?: string
  version?: string
  license?: string
  attribution?: string
  grammar?: { wordOrder?: string }
  glossary?: Record<string, RawEntry>
}

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024

/** Parse estrito: falha (throw) em manifest inválido — contratos claros no erro. */
export function parseSignPack(raw: RawPack): SignPack {
  if (!raw?.locale) throw new Error('spack: locale obrigatório')
  if (!raw.version) throw new Error('spack: version obrigatória')
  if (!raw.license) throw new Error('spack: license obrigatória')
  if (!raw.attribution) throw new Error('spack: attribution obrigatória (direitos da comunidade)')
  const glossaryRaw = raw.glossary
  if (!glossaryRaw || typeof glossaryRaw !== 'object' || Object.keys(glossaryRaw).length === 0) {
    throw new Error('spack: glossary não pode ser vazio')
  }
  const glossary = new Map<string, SignEntry>()
  for (const [term, entry] of Object.entries(glossaryRaw)) {
    glossary.set(term, {
      signs: entry?.signs ?? [term],
      fingerspelling: entry?.fingerspelling ?? true,
      video: entry?.video,
    })
  }
  return {
    locale: raw.locale,
    version: raw.version,
    license: raw.license,
    attribution: raw.attribution,
    grammar: raw.grammar ?? {},
    glossary,
  }
}

/** Validação não-fatal: retorna lista de erros (curadoria/upload F3 e UX de import). */
export function validateSignPack(raw: RawPack): string[] {
  try {
    const pack = parseSignPack(raw)
    const errors: string[] = []
    for (const [term, entry] of pack.glossary) {
      if (!entry.video && !entry.fingerspelling) {
        errors.push(`sinal "${term}": sem vídeo e sem fingerspelling fallback`)
      }
      if (entry.video) {
        if (!entry.video.url) errors.push(`sinal "${term}": vídeo sem url`)
        if (entry.video.size > MAX_VIDEO_BYTES) {
          errors.push(`sinal "${term}": vídeo acima de 5MB (${entry.video.size} bytes)`)
        }
      }
    }
    return errors
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }
}
