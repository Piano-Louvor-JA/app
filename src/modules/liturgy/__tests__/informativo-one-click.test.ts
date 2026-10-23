// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockState = new Map<string, unknown>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (key: string, fallback: unknown) => mockState.get(key) ?? fallback,
  setBrowserItem: (key: string, value: unknown) => { mockState.set(key, value) },
}))

import { runInformativoOneClick } from '../services/informativo-one-click'
import { READ_PROXY, fetchSourceText } from '../services/scheduled-source-fetch'
import { informativoPostUrl } from '../services/informativo-source'
import { useScheduledStore } from '../stores/useScheduledStore'

const POST_URL = informativoPostUrl('2026-10-17')
const POST_MARKDOWN = `Artigo ... https://www.youtube.com/watch?v=CiBuNdqguD4 fim do artigo`

describe('B5: fluxo executável fetch → proxy CORS → agenda (sem rede real)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.clear()
    vi.restoreAllMocks()
  })

  it('CORS: fetch direto rejeita, proxy r.jina.ai devolve markdown com YouTube → agenda online_video', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url) === POST_URL) throw new TypeError('Failed to fetch') // CORS
      if (String(url) === `${READ_PROXY}${POST_URL}`) {
        return { ok: true, text: async () => POST_MARKDOWN } as Response
      }
      throw new TypeError(`unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await fetchSourceText(POST_URL)
    expect(text).toContain('CiBuNdqguD4')

    const store = useScheduledStore()
    const result = await runInformativoOneClick(store, {
      fetchText: fetchSourceText,
      count: 1,
    })
    expect(result.unavailable).toBe(false)
    expect(result.created).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(`${READ_PROXY}${POST_URL}`)
    const rot = store.categories.find((c) => c.name === 'Informativo')
    expect(store.findOn(rot!.id, '2026-10-17')?.content).toEqual({
      kind: 'online_video', url: 'https://www.youtube.com/watch?v=CiBuNdqguD4',
    })
    vi.useRealTimers()
  })

  it('B3: fetch direto E proxy falham → unavailable=true, sem crash, nada agendado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const store = useScheduledStore()
    const result = await runInformativoOneClick(store, {
      fetchText: fetchSourceText,
      count: 1,
    })
    expect(result).toMatchObject({ unavailable: true, created: 0 })
    expect(store.items).toHaveLength(0)
  })

  it('progresso é reportado por semana (1/1) durante a varredura', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url) === POST_URL) {
        return { ok: true, text: async () => POST_MARKDOWN } as Response
      }
      throw new TypeError('Failed to fetch')
    }))
    const progress: Array<[number, number]> = []
    await runInformativoOneClick(useScheduledStore(), {
      fetchText: fetchSourceText,
      count: 1,
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(progress).toEqual([[1, 1]])
  })

  it('B2 no fluxo: rodar 2x não duplica (idempotente end-to-end)', async () => {
    let calls = 0
    const fetchText = vi.fn(async () => {
      calls++
      return POST_MARKDOWN
    })
    const store = useScheduledStore()
    const first = await runInformativoOneClick(store, { fetchText, count: 1 })
    const second = await runInformativoOneClick(store, { fetchText, count: 1 })
    expect(first.created).toBe(1)
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(1)
    expect(store.items).toHaveLength(1)
  })
})
