/**
 * sign-pack-store — F1.2 (SPEC-libras-v2.0.0)
 * Store de Sign Packs: import, pack ativo por locale, persistência
 * (userPreferences Electron via shared; localStorage como cache local).
 * Singleton module-scope — um pack ativo por vez por app.
 */
import { parseSignPack, type SignPack, type SignEntry, type RawPack, type RawEntry } from './sign-pack'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

export const LIBRAS_PACK_KEY = 'libras.activePack'

const packs = new Map<string, SignPack>()
let activeLocale: string | null = null

function packKey(raw: RawPack): string {
  return raw.locale ?? ''
}

export const signPackStore = {
  import(raw: RawPack): SignPack {
    const pack = parseSignPack(raw)
    packs.set(pack.locale, pack)
    activeLocale = pack.locale
    setUserPreference(LIBRAS_PACK_KEY, { locale: pack.locale, version: pack.version })
    return pack
  },

  getActive(): SignPack | null {
    if (!activeLocale) return null
    return packs.get(activeLocale) ?? null
  },

  activate(locale: string): boolean {
    if (!packs.has(locale)) return false
    activeLocale = locale
    return true
  },

  size(): number {
    return packs.size
  },

  clear(): void {
    packs.clear()
    activeLocale = null
  },

  persistActive(): void {
    const active = this.getActive()
    if (!active) return
    setUserPreference(LIBRAS_PACK_KEY, { locale: active.locale, version: active.version })
    localStorage.setItem(LIBRAS_PACK_KEY, JSON.stringify(activeRaw(active)))
  },

  restoreActive(): SignPack | null {
    const savedPref = getUserPreference<{ locale: string; version: string }>(LIBRAS_PACK_KEY, null)
    const json = localStorage.getItem(LIBRAS_PACK_KEY)
    if (json) {
      try {
        const raw = JSON.parse(json) as RawPack
        return this.import(raw)
      } catch {
        // cache corrupto — ignora, sem crash
      }
    }
    if (savedPref?.locale && packs.has(savedPref.locale)) {
      activeLocale = savedPref.locale
      return packs.get(savedPref.locale) ?? null
    }
    return null
  },

  /** resolve termo: vídeo do dicionário ou fingerspelling fallback (F1.1 contrato). */
  resolve(term: string): SignEntry | null {
    const pack = this.getActive()
    if (!pack) return null
    return (
      pack.glossary.get(term) ?? { signs: [term], fingerspelling: true }
    )
  },
}

function activeRaw(pack: SignPack): RawPack {
  const glossary: Record<string, RawEntry> = {}
  for (const [term, entry] of pack.glossary) {
    glossary[term] = entry
  }
  return {
    locale: pack.locale,
    version: pack.version,
    license: pack.license,
    attribution: pack.attribution,
    grammar: pack.grammar,
    glossary,
  }
}
