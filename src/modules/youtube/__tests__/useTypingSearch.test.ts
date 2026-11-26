import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { TYPING_MIN_CHARS, TYPING_PAUSE_MS, useTypingSearch } from '../composables/useTypingSearch'

function setup(options: Partial<Parameters<typeof useTypingSearch>[1]> = {}) {
  const text = ref('')
  const run = vi.fn()
  const clear = vi.fn()
  const scope = effectScope()
  const api = scope.run(() => useTypingSearch(text, { run, clear, ...options }))!
  return { text, run, clear, scope, api }
}

async function type(text: { value: string }, value: string) {
  text.value = value
  await nextTick()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useTypingSearch (busca enquanto digita, igual ao apk)', () => {
  it('busca sozinho depois da pausa, com o texto sem espaços nas pontas', async () => {
    const { text, run } = setup()
    await type(text, '  louvor ')
    vi.advanceTimersByTime(TYPING_PAUSE_MS - 1)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledWith('louvor')
    expect(TYPING_PAUSE_MS).toBe(700)
  })

  it('cada tecla reinicia a espera: só a última vai', async () => {
    const { text, run } = setup()
    await type(text, 'lou')
    vi.advanceTimersByTime(400)
    await type(text, 'louv')
    vi.advanceTimersByTime(400)
    await type(text, 'louvor')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('louvor')
  })

  it(`menos de ${TYPING_MIN_CHARS} letras não busca`, async () => {
    const { text, run } = setup()
    await type(text, 'lo')
    vi.advanceTimersByTime(TYPING_PAUSE_MS * 2)
    expect(run).not.toHaveBeenCalled()
  })

  it('apagar tudo limpa na hora (e cancela a busca pendente)', async () => {
    const { text, run, clear } = setup()
    await type(text, 'louvor')
    await type(text, '   ')
    expect(clear).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('não repete a busca do texto que já está na tela', async () => {
    const current = ref('louvor')
    const { text, run } = setup({ current: () => current.value })
    await type(text, 'louvor ')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('o que `skip` recusar (ex.: link colado) não busca sozinho', async () => {
    const { text, run } = setup({ skip: (q) => q.startsWith('http') })
    await type(text, 'https://youtu.be/AAAAAAAAAAA')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('cancel (Enter/botão) evita a busca dobrada; dispose para tudo', async () => {
    const { text, run, api, scope } = setup()
    await type(text, 'louvor')
    api.cancel()
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()

    await type(text, 'jovens')
    scope.stop()
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
    await type(text, 'natal')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('sem `clear`, apagar só cancela', async () => {
    const text = ref('')
    const run = vi.fn()
    const scope = effectScope()
    scope.run(() => useTypingSearch(text, { run }))
    await type(text, 'louvor')
    await type(text, '')
    vi.advanceTimersByTime(TYPING_PAUSE_MS)
    expect(run).not.toHaveBeenCalled()
    scope.stop()
  })
})
