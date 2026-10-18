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
})
