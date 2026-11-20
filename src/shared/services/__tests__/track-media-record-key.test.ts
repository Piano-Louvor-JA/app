import { describe, expect, it, vi } from 'vitest'

/**
 * Fix app#es-music-lookup: records individuais NÃO levam prefixo de idioma
 * (contrato compat.ts:339). Ver catalog-record-contract.test.ts para as
 * provas HTTP contra o STG (music_2643=200, es_music_2643=404).
 */

vi.mock('@shared/services/api-fallback', () => ({
  getCurrentApiPrefix: () => 'es',
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: async (file: string) => {
    const res = await fetch(`https://api-stg.pianolouvorja.com.br/json_db/${file}`)
    return res.json()
  },
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: vi.fn(async () => null),
}))

import { collectTrackMediaItems } from '@shared/services/track-media'

const fetchCalls: string[] = []
const originalFetch = globalThis.fetch
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    return new Response(JSON.stringify({ id_music: 2643, lyric: [], url_music: '/musics/es/x.mp3' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }),
)

describe('filename de record individual sem prefixo de idioma', () => {
  it('track-media coleta mídia via music_{id} (não es_music_{id})', async () => {
    await collectTrackMediaItems(2643)
    const recordCall = fetchCalls.find((u) => u.includes('/json_db/'))
    expect(recordCall).toBeDefined()
    expect(recordCall).toMatch(/\/json_db\/music_2643\b/)
    expect(recordCall).not.toMatch(/es_music_2643/)
  })
})
