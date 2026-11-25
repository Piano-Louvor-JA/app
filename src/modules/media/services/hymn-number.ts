import type { MediaTrackRecord } from '../types/media'

const HYMNAL_NAME = /hin[áa]rio adventista|himnario adventista/i

/**
 * Número do hino (capa do hinário): a faixa no Hinário Adventista. Prefere o
 * hinário aberto (atual ou 1996); aberta por outro álbum, usa o primeiro
 * hinário da música. Sem hinário/faixa: null.
 */
export function resolveHymnNumber(track: MediaTrackRecord, albumId: number | null): number | null {
  const hymnals = track.albums.filter(
    (album) => HYMNAL_NAME.test(album.name) && album.track != null && album.track > 0,
  )
  const chosen = hymnals.find((album) => album.id === albumId) ?? hymnals[0]
  return chosen?.track ?? null
}
