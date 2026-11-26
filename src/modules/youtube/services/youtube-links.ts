/**
 * Reconhece links colados para agir sozinho (cadastrar canal, ler playlist).
 * É só um filtro rápido no renderer: quem valida de verdade é o app desktop.
 */

const HANDLE = /^@[\p{L}\p{N}_.\-·]{2,}$/u
const CHANNEL_ID = /^UC[\w-]{22}$/
const PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/

/** Link de canal do YouTube, `@handle` completo ou id `UC…`. */
export function isChannelLink(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  if (HANDLE.test(value) || CHANNEL_ID.test(value)) return true
  return /^(https?:\/\/)?([\w-]+\.)*youtube\.com\/(@[^/?#\s]{2,}|channel\/UC[\w-]{22}|c\/[^/?#\s]+|user\/[^/?#\s]+)/i.test(value)
}

/** Link com `list=` ou o id da playlist colado sozinho. */
export function isPlaylistLink(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return PLAYLIST_ID.test(value) || /[?&#]list=[\w-]{10,}/.test(value)
}
