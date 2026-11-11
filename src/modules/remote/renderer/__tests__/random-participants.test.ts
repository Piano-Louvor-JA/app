import { beforeEach, describe, expect, it } from 'vitest'
import { serialize } from 'node:v8'
import { createPinia, setActivePinia } from 'pinia'
import { useRandomStore } from '../../../random/stores/useRandomStore'
import { createModuleHandlers } from '../module-handlers'
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
describe('participantes do sorteio no APK', () => {
  it('snapshot reúne nomes adicionados individualmente e importados', async () => {
    const store = useRandomStore()
    store.setMode('names')
    const h = createModuleHandlers({ random: store } as never)
    await h.execute('random', 'random.addName', { name: 'Maria' })
    await h.execute('random', 'random.importNames', { namesText: 'João\nAna' })
    expect(h.snapshot('random')).toMatchObject({ available: ['Maria', 'João', 'Ana'], drawn: [], availableCount: 3 })
  })
  it('estado de participantes pode atravessar o IPC do Electron', () => {
    const store = useRandomStore()
    store.setMode('names')
    store.addName('Maria')
    const h = createModuleHandlers({ random: store } as never)
    expect(() => serialize(h.snapshot('random'))).not.toThrow()
  })

  it('devolve e remove usando o índice enviado em value pelo APK; limpar histórico libera todos', async () => {
    const store = useRandomStore()
    store.setMode('names')
    store.addName('Ana'); store.addName('Bia')
    store.drawn.push('Ana')
    const h = createModuleHandlers({ random: store } as never)
    expect(await h.execute('random', 'random.removeDrawn', { value: 0 })).toBe(true)
    expect(store.drawn).toEqual([])
    expect(store.undrawn).toContain('Ana')
    store.drawn.push('Ana', 'Bia')
    expect(await h.execute('random', 'random.clearHistory', {})).toBe(true)
    expect(store.undrawn).toEqual(['Ana', 'Bia'])
    expect(await h.execute('random', 'random.removeAvailable', { value: 1 })).toBe(true)
    expect(store.available).toEqual(['Ana'])
  })

})
