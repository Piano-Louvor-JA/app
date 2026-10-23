// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockState = new Map<string, unknown>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (key: string, fallback: unknown) => mockState.get(key) ?? fallback,
  setBrowserItem: (key: string, value: unknown) => { mockState.set(key, value) },
}))

import { importInformativoEpisodes } from '../services/informativo-import'
import { useScheduledStore } from '../stores/useScheduledStore'

const episodes = [
  { dateISO: '2026-10-03', title: 'Informativo Mundial das Missões', url: 'https://www.youtube.com/watch?v=firstVideo1' },
  { dateISO: '2026-10-10', title: 'Informativo Mundial das Missões', url: 'https://www.youtube.com/watch?v=secondVid2' },
]

describe('Informativo Mundial das Missões — auto-agendamento', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.clear()
  })

  it('cria rotação Informativo e salva link online', () => {
    const store = useScheduledStore()
    const report = importInformativoEpisodes(store, episodes)
    expect(report.created).toBe(2)
    expect(store.categoryName(report.rotationId)).toBe('Informativo')
    expect(store.findOn(report.rotationId, '2026-10-03')?.content).toEqual({
      kind: 'online_video', url: episodes[0]!.url,
    })
  })

  it('B2: ignora passado e segunda execução não duplica', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 5))
    try {
      const store = useScheduledStore()
      const first = importInformativoEpisodes(store, episodes, { onlyUpcoming: true })
      const second = importInformativoEpisodes(store, episodes, { onlyUpcoming: true })
      expect(first).toMatchObject({ created: 1, skippedPast: 1 })
      expect(second).toMatchObject({ created: 0, skipped: 1, skippedPast: 1 })
      expect(store.items).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('CRÍTICO: entrada manual existente na mesma data é preservada (nunca sobrescrita)', () => {
    const store = useScheduledStore()
    const rotId = 'rot-manual'
    store.upsertCategory({ id: rotId, name: 'Informativo' })
    store.upsertItem({
      id: 'sch-manual-1',
      categoryId: rotId,
      date: '2026-10-10',
      name: 'Hino especial escolhido pela equipe',
      content: { kind: 'music', musicId: 'mus-123' },
    })
    const report = importInformativoEpisodes(store, episodes)
    expect(report.skipped).toBeGreaterThanOrEqual(1)
    const kept = store.findOn(rotId, '2026-10-10')
    expect(kept?.name).toBe('Hino especial escolhido pela equipe')
    expect(kept?.content).toEqual({ kind: 'music', musicId: 'mus-123' })
  })

  it('CRÍTICO (roundtrip): online_video importado sobrevive a save→reload (novo Pinia)', () => {
    const store = useScheduledStore()
    const report = importInformativoEpisodes(store, episodes)
    expect(report.created).toBe(2)

    // reload: nova instância Pinia lendo do "disco" (mockState persiste)
    setActivePinia(createPinia())
    const reloaded = useScheduledStore()
    const rot = reloaded.categories.find((c) => c.name === 'Informativo')
    expect(rot).toBeDefined()
    expect(reloaded.findOn(rot!.id, '2026-10-03')?.content).toEqual({
      kind: 'online_video', url: 'https://www.youtube.com/watch?v=firstVideo1',
    })
    expect(reloaded.findOn(rot!.id, '2026-10-10')?.content).toEqual({
      kind: 'online_video', url: 'https://www.youtube.com/watch?v=secondVid2',
    })
  })

  it('CRÍTICO (roundtrip): entrada manual preservada sobrevive a save→reload com o import no meio', () => {
    const store = useScheduledStore()
    const rotId = 'rot-manual'
    store.upsertCategory({ id: rotId, name: 'Informativo' })
    store.upsertItem({
      id: 'sch-manual-2',
      categoryId: rotId,
      date: '2026-10-10',
      name: 'Hino especial escolhido pela equipe',
      content: { kind: 'music', musicId: 'mus-123' },
    })

    setActivePinia(createPinia())
    const reloaded = useScheduledStore()
    const report = importInformativoEpisodes(reloaded, episodes)
    expect(report.created).toBe(1)
    expect(report.skipped).toBe(1)

    // segundo reload: nada do que está em disco pode ter sido perdido
    setActivePinia(createPinia())
    const again = useScheduledStore()
    const kept = again.findOn(rotId, '2026-10-10')
    expect(kept?.content).toEqual({ kind: 'music', musicId: 'mus-123' })
    expect(kept?.name).toBe('Hino especial escolhido pela equipe')
    // episódio importado na data livre continua lá
    expect(again.findOn(rotId, '2026-10-03')?.content).toEqual({
      kind: 'online_video', url: 'https://www.youtube.com/watch?v=firstVideo1',
    })
  })
})
