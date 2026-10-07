// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockState = new Map<string, unknown>()
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: (key: string, fallback: unknown) => mockState.get(key) ?? fallback,
  setBrowserItem: (key: string, value: unknown) => { mockState.set(key, value) },
}))

import { useScheduledStore } from '../stores/useScheduledStore'
import {
  importProvaiEVedeEpisodes,
} from '../services/provai-e-vede-import'

describe('importar episódios P&V → auto-agendar na rotação', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.clear()
  })

  const episodes = [
    { dateISO: '2026-10-03', title: 'Quem chegou à igreja aqui', url: 'https://b2/10-03-26_a.mp4' },
    { dateISO: '2026-10-10', title: 'O milagre entre os galhos secos', url: 'https://b2/10-10-26_b.mp4' },
  ]

  it('B2: cria rotação (se falta) e agenda cada episódio como file com filePath local', () => {
    const store = useScheduledStore()
    const report = importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)

    expect(report.created).toBe(2)
    expect(report.rotationId).toBeTruthy()
    const rotName = store.categoryName(report.rotationId)
    expect(rotName).toBe('Provai e Vede')

    const items = store.items.filter((i) => i.categoryId === report.rotationId)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      date: '2026-10-03',
      content: { kind: 'file', filePath: '/media/videos/2026-10-03.mp4' },
    })
  })

  it('B3: rodar 2x NÃO duplica (idempotente por categoryId+date)', () => {
    const store = useScheduledStore()
    importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)
    const report2 = importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)
    expect(report2.created).toBe(0)
    expect(report2.skipped).toBe(2)

    // Rotação reusada (não criou segunda "Provai e Vede")
    const rotations = store.categories.filter((c) => c.name === 'Provai e Vede')
    expect(rotations).toHaveLength(1)
    expect(store.items).toHaveLength(2)
  })

  it('B4: aceita subconjunto (usuário escolhe só os próximos sábados)', () => {
    const store = useScheduledStore()
    const report = importProvaiEVedeEpisodes(store, [episodes[0]!], () => '/v/a.mp4')
    expect(report.created).toBe(1)
  })
})
