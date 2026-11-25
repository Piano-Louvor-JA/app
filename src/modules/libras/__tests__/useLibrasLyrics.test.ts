import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('../services/libras-preferences', () => ({
  isLibrasEnabled: vi.fn(),
  setLibrasEnabled: vi.fn(),
}))
vi.mock('../services/libras-translate', () => ({
  getLibrasGloss: vi.fn(),
}))

import { isLibrasEnabled } from '../services/libras-preferences'
import { getLibrasGloss } from '../services/libras-translate'
import { useLibrasLyrics } from '../composables/useLibrasLyrics'

const mockedEnabled = vi.mocked(isLibrasEnabled)
const mockedGloss = vi.mocked(getLibrasGloss)

describe('useLibrasLyrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('desligado: não trabalha — estado disabled, zero chamadas', async () => {
    mockedEnabled.mockReturnValue(false)
    const lyrics = ref<string | null>('Letra A')
    const { state, gloss } = useLibrasLyrics(lyrics)
    await vi.waitFor(() => expect(state.value).toBe('disabled'))
    expect(mockedGloss).not.toHaveBeenCalled()
    expect(gloss.value).toBeNull()
  })

  it('ligado online: tradução válida → ready com gloss', async () => {
    mockedEnabled.mockReturnValue(true)
    mockedGloss.mockResolvedValue({ gloss: 'H I N O _ S A N T O', sourceUsed: 'cache' })
    const lyrics = ref<string | null>('Hino Santo')
    const { state, gloss } = useLibrasLyrics(lyrics)
    await vi.waitFor(() => expect(state.value).toBe('ready'))
    expect(mockedGloss).toHaveBeenCalledWith('Hino Santo')
    expect(gloss.value).toBe('H I N O _ S A N T O')
  })

  it('ligado sem letra: estado disabled (não lança)', async () => {
    mockedEnabled.mockReturnValue(true)
    const lyrics = ref<string | null>(null)
    const { state, gloss } = useLibrasLyrics(lyrefnull())
    await vi.waitFor(() => expect(state.value).toBe('disabled'))
    expect(gloss.value).toBeNull()
  })

  it('letra null muda para válida: reage e traduz', async () => {
    mockedEnabled.mockReturnValue(true)
    mockedGloss.mockResolvedValue({ gloss: 'A', sourceUsed: 'api' })
    const lyrics = ref<string | null>(null)
    const { state, gloss } = useLibrasLyrics(lyrics)
    await vi.waitFor(() => expect(state.value).toBe('disabled'))
    lyrics.value = 'Letra Nova'
    await vi.waitFor(() => expect(state.value).toBe('ready'))
    expect(gloss.value).toBe('A')
  })

  it('falha total (gloss null): estado unavailable, gloss null', async () => {
    mockedEnabled.mockReturnValue(true)
    mockedGloss.mockResolvedValue({ gloss: null, sourceUsed: 'fallback' })
    const lyrics = ref<string | null>('Letra B')
    const { state, gloss } = useLibrasLyrics(lyrics)
    await vi.waitFor(() => expect(state.value).toBe('unavailable'))
    expect(gloss.value).toBeNull()
  })

  it('troca rápida A→B: resultado A não aparece em B (stale descartado)', async () => {
    mockedEnabled.mockReturnValue(true)
    let resolveA: (v: { gloss: string | null; sourceUsed: string }) => void
    const deferredA = new Promise<{ gloss: string | null; sourceUsed: string }>((res) => { resolveA = res })
    let resolveB: (v: { gloss: string | null; sourceUsed: string }) => void
    const deferredB = new Promise<{ gloss: string | null; sourceUsed: string }>((res) => { resolveB = res })
    mockedGloss.mockImplementationOnce(() => deferredA as never).mockImplementationOnce(() => deferredB as never)

    const lyrics = ref<string | null>('Letra A')
    const { state, gloss } = useLibrasLyrics(lyrics)
    lyrics.value = 'Letra B'
    resolveB!({ gloss: 'B GLOSS', sourceUsed: 'api' })
    await vi.waitFor(() => expect(state.value).toBe('ready'))
    expect(gloss.value).toBe('B GLOSS')
    resolveA!({ gloss: 'A GLOSS', sourceUsed: 'api' })
    await vi.waitFor(() => expect(gloss.value).toBe('B GLOSS'))
    expect(state.value).toBe('ready')
  })

  it('deduplica requisição idêntica por chave (mesma letra)', async () => {
    mockedEnabled.mockReturnValue(true)
    mockedGloss.mockResolvedValue({ gloss: 'G', sourceUsed: 'cache' })
    const lyrics = ref<string | null>('Mesma')
    const { state } = useLibrasLyrics(lyrics)
    await vi.waitFor(() => expect(state.value).toBe('ready'))
    lyrics.value = 'Mesma '
    await vi.waitFor(() => expect(mockedGloss).toHaveBeenCalledTimes(1))
  })
})

function lyrefnull() { return ref<string | null>(null) }