import { describe, expect, it, vi } from 'vitest'

import { getCurrentApiPrefix } from '@shared/services/api-fallback'

/**
 * Contrato da API (compat.ts:339): records individuais `music_{id}` e
 * `album_{id}` NÃO levam prefixo de idioma — o ID é global/único
 * (hino 1 ES = music_2643, JA ES = music_90168; ambos 200 no STG).
 * Apenas LISTAS (`{lang}_categories`, `{lang}_hymnal`) têm prefixo.
 * Provas 11/10/2026: /json_db/music_2643=200, music_90168=200, music_1=200,
 * es_music_2643=404, pt_music_1=404, album_9015=200, es_album_9015=404.
 */

vi.mock('@shared/services/api-fallback', () => ({
  getCurrentApiPrefix: () => 'es',
}))

const STG = 'https://api-stg.pianolouvorja.com.br/json_db'

describe('contrato records individuais sem prefixo de idioma', () => {
  it('music_{id} existe sem prefixo mesmo com idioma es ativo', async () => {
    expect(getCurrentApiPrefix()).toBe('es') // sanity: idioma es
    const res = await fetch(`${STG}/music_2643`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id_music?: number; url_music?: string }
    expect(body.id_music).toBe(2643)
    expect(String(body.url_music)).toContain('/musics/es/')
  })

  it('es_music_{id} (com prefixo) não existe — 404 terminal', async () => {
    const res = await fetch(`${STG}/es_music_2643`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    expect(res.status).toBe(404)
  })

  it('album_{id} existe sem prefixo', async () => {
    const res = await fetch(`${STG}/album_9015`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    expect(res.status).toBe(200)
  })
})
