import { DEFAULT_FONT_FAMILY, findFont } from '@modules/settings/data/font-catalog'
import type { InstalledFont } from '@shared/types/fonts'
import { getDesktopBridge, isDesktopApp } from './desktop-bridge'

const loaded = new Map<string, Promise<string>>()
export function resetFontLoader() { loaded.clear() }

export async function loadLocalFont(id: string | null, supplied?: InstalledFont): Promise<string> {
  if (!id) return DEFAULT_FONT_FAMILY
  if (!findFont(id)) throw new Error('font-missing')
  const key = supplied ? `${id}:${supplied.faces.map(f => f.url).join(',')}` : id
  const previous = loaded.get(key)
  if (previous) return previous
  const promise = (async () => {
    if (!isDesktopApp()) throw new Error('font-desktop-only')
    const manifest = supplied ?? (await getDesktopBridge()?.fonts?.listInstalled())?.find(font => font.id === id)
    if (!manifest || !manifest.faces.length || typeof FontFace === 'undefined' || !document.fonts) throw new Error('font-missing')
    // A private alias avoids collision with bundled fonts and with temporary previews.
    const alias = `LouvorJA-${id}${supplied?.faces[0]?.url.includes('.preview-') ? '-preview' : ''}`
    const faces = manifest.faces.map(face => {
      if (!face.url.startsWith(`local://media/fontes/`) || /["()\s]/.test(face.url)) throw new Error('invalid-font-url')
      return new FontFace(alias, `url("${face.url}") format("woff2")`, { weight: face.weight, unicodeRange: face.unicodeRange, style: 'normal', display: 'swap' })
    })
    await Promise.all(faces.map(face => face.load()))
    for (const face of faces) document.fonts.add(face)
    await document.fonts.ready
    return `'${alias}', ${DEFAULT_FONT_FAMILY}`
  })()
  loaded.set(key, promise)
  try { return await promise } catch (error) { loaded.delete(key); throw error }
}
