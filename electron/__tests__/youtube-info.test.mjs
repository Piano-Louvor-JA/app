// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { extractPlayerResponse, fetchYoutubeInfo, registerYoutubeInfoIpc, youtubeInfoFromPlayerResponse } from '../youtube-info.mjs'

const ID = '0GnC-QzIpyo'
const details = {
  title: ' Quarteto Athus - Deus o Pode ',
  author: 'Eder Bomfim',
  lengthSeconds: '303',
  shortDescription: 'Canção "belíssima" {com chaves} \\ e barra\nSegunda linha',
}
const page = (response) => `<script>var x = 1;var ytInitialPlayerResponse = ${JSON.stringify(response)};var meta = {"a":1};</script>`

describe('dados do vídeo do YouTube pela página', () => {
  it('lê o objeto do player respeitando aspas, chaves e barras dentro das strings', () => {
    expect(extractPlayerResponse(page({ videoDetails: details }))).toEqual({ videoDetails: details })
    expect(extractPlayerResponse('<html>sem dados</html>')).toBeNull()
    expect(extractPlayerResponse('ytInitialPlayerResponse = null;')).toBeNull()
    expect(extractPlayerResponse('ytInitialPlayerResponse = {"a": "sem fim')).toBeNull()
    expect(extractPlayerResponse('ytInitialPlayerResponse = {"a": tudo errado}')).toBeNull()
    expect(extractPlayerResponse(undefined)).toBeNull()
  })

  it('título, canal, descrição e duração; sem título não há dados', () => {
    expect(youtubeInfoFromPlayerResponse({ videoDetails: details })).toEqual({
      title: 'Quarteto Athus - Deus o Pode',
      channel: 'Eder Bomfim',
      description: details.shortDescription,
      durationMs: 303_000,
    })
    expect(youtubeInfoFromPlayerResponse({ videoDetails: { title: 'Ao vivo', lengthSeconds: '0' } })).toEqual({
      title: 'Ao vivo', channel: '', description: '', durationMs: 0,
    })
    expect(youtubeInfoFromPlayerResponse({ videoDetails: { title: 'X', lengthSeconds: 'abc' } }).durationMs).toBe(0)
    expect(youtubeInfoFromPlayerResponse({ playabilityStatus: { status: 'LOGIN_REQUIRED' } })).toBeNull()
    expect(youtubeInfoFromPlayerResponse({ videoDetails: { title: '  ' } })).toBeNull()
    expect(youtubeInfoFromPlayerResponse(null)).toBeNull()
  })

  it('busca a página do vídeo em português e devolve null em qualquer falha', async () => {
    const fetch = vi.fn(async () => ({ ok: true, text: async () => page({ videoDetails: details }) }))
    expect((await fetchYoutubeInfo(ID, { fetch }))?.durationMs).toBe(303_000)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`https://www.youtube.com/watch?v=${ID}&hl=pt-BR`)
    expect(init.headers['Accept-Language']).toMatch(/^pt-BR/)
    expect(init.signal).toBeInstanceOf(AbortSignal)

    expect(await fetchYoutubeInfo('curto', { fetch })).toBeNull()
    expect(await fetchYoutubeInfo(undefined, { fetch })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await fetchYoutubeInfo(ID, { fetch: async () => ({ ok: false }) })).toBeNull()
    expect(await fetchYoutubeInfo(ID, { fetch: async () => { throw new Error('offline') } })).toBeNull()
  })

  it('IPC youtube-info:get', async () => {
    let handler
    registerYoutubeInfoIpc({ handle: (channel, fn) => { expect(channel).toBe('youtube-info:get'); handler = fn } }, {
      fetch: async () => ({ ok: true, text: async () => page({ videoDetails: details }) }),
    })
    expect((await handler({}, ID))?.title).toBe('Quarteto Athus - Deus o Pode')
    expect(await handler({}, null)).toBeNull()
  })
})
