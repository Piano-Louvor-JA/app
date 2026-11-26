// File: src/modules/libras/composables/__tests__/useLibrasLive.test.ts
// SPDX-License-Identifier: MIT
// F-B.2 (SPEC v2.1): tradução ao vivo do slide da projeção → gloss → playGloss.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useLibrasLive } from '../useLibrasLive'

const getLibrasGloss = vi.fn()
vi.mock('../../services/libras-translate', () => ({
  getLibrasGloss: (...a: unknown[]) => getLibrasGloss(...a),
}))

beforeEach(() => {
  vi.useFakeTimers()
  getLibrasGloss.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

async function flush() {
  await vi.advanceTimersByTimeAsync(700) // debounce 600ms
  await nextTick()
}

describe('F-B.2 — useLibrasLive', () => {
  it('slide vazio: gloss vazio, não chama API', async () => {
    const lyric = ref('')
    const live = useLibrasLive(lyric)
    await flush()
    expect(live.gloss.value).toBe('')
    expect(getLibrasGloss).not.toHaveBeenCalled()
  })

  it('slide de letra: traduz e expõe gloss', async () => {
    getLibrasGloss.mockResolvedValue({ gloss: 'DEUS AMOR', sourceUsed: 'api' })
    const lyric = ref('Deus é amor')
    const live = useLibrasLive(lyric)
    await flush()
    expect(live.gloss.value).toBe('DEUS AMOR')
    expect(live.translating.value).toBe(false)
    expect(getLibrasGloss).toHaveBeenCalledWith('Deus é amor')
  })

  it('debounce: digitação rápida de slides só traduz o último', async () => {
    getLibrasGloss.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ gloss: 'G', sourceUsed: 'api' }), 100)),
    )
    const lyric = ref('um')
    useLibrasLive(lyric)
    await vi.advanceTimersByTimeAsync(100)
    lyric.value = 'dois'
    await vi.advanceTimersByTimeAsync(100)
    lyric.value = 'três'
    await vi.advanceTimersByTimeAsync(700)
    expect(getLibrasGloss).toHaveBeenCalledTimes(1)
    expect(getLibrasGloss).toHaveBeenCalledWith('três')
  })

  it('mudança enquanto traduz: resposta velha é descartada (latest wins)', async () => {
    getLibrasGloss.mockImplementation((t: string) => new Promise((r) => setTimeout(() => r({ gloss: `G-${t}`, sourceUsed: 'api' }), 200)))
    const lyric = ref('primeiro')
    const live = useLibrasLive(lyric)
    await vi.advanceTimersByTimeAsync(700)
    lyric.value = 'segundo'
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(300)
    expect(live.gloss.value).toBe('G-segundo')
  })

  it('falha da API: gloss fica vazio, não lança', async () => {
    getLibrasGloss.mockRejectedValue(new Error('down'))
    const lyric = ref('texto')
    const live = useLibrasLive(lyric)
    await flush()
    expect(live.gloss.value).toBe('')
    expect(live.translating.value).toBe(false)
  })

  it('capa: isActive=false → gloss limpa e não traduz', async () => {
    getLibrasGloss.mockResolvedValue({ gloss: 'X', sourceUsed: 'api' })
    const lyric = ref('letra')
    const isActive = ref(true)
    const live = useLibrasLive(lyric, isActive)
    await flush()
    expect(live.gloss.value).toBe('X')
    isActive.value = false // virou capa
    await flush()
    expect(live.gloss.value).toBe('')
    expect(getLibrasGloss).toHaveBeenCalledTimes(1) // não retraduziu
  })
})
