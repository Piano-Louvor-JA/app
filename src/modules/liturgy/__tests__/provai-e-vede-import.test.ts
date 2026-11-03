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

  it('B2: cria rotação (se falta) e agenda cada episódio como file com filePath local', async () => {
    const store = useScheduledStore()
    const report = await importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)

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

  it('B3: rodar 2x NÃO duplica (idempotente por categoryId+date)', async () => {
    const store = useScheduledStore()
    await importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)
    const report2 = await importProvaiEVedeEpisodes(store, episodes, (ep) => `/media/videos/${ep.dateISO}.mp4`)
    expect(report2.created).toBe(0)
    expect(report2.skipped).toBe(2)

    const rotations = store.categories.filter((c) => c.name === 'Provai e Vede')
    expect(rotations).toHaveLength(1)
    expect(store.items).toHaveLength(2)
  })

  it('recupera entrada antiga sem arquivo em vez de pulá-la para sempre', async () => {
    const store = useScheduledStore()
    const rotationId = 'rot-pv-antigo'
    store.upsertCategory({ id: rotationId, name: 'Provai e Vede' })
    store.upsertItem({
      id: 'sch-antigo',
      categoryId: rotationId,
      date: '2026-10-10',
      name: 'O milagre entre os galhos secos',
      content: { kind: 'file', filePath: '' },
    })

    const resolvePath = vi.fn(() => '/media/provai-e-vede/10-10-26.mp4')
    const report = await importProvaiEVedeEpisodes(store, [episodes[1]!], resolvePath)

    expect(resolvePath).toHaveBeenCalledOnce()
    expect(report.created).toBe(0)
    expect(store.findOn(rotationId, '2026-10-10')?.content).toMatchObject({
      kind: 'file',
      filePath: '/media/provai-e-vede/10-10-26.mp4',
    })
  })

  it('B4: aceita subconjunto (usuário escolhe só os próximos sábados)', async () => {
    const store = useScheduledStore()
    const report = await importProvaiEVedeEpisodes(store, [episodes[0]!], () => '/v/a.mp4')
    expect(report.created).toBe(1)
  })
})

describe('1-click — só sábados por vir', () => {
  it('episódios com data passada são ignorados', async () => {
    const store = useScheduledStore()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20))
    try {
      const report = await importProvaiEVedeEpisodes(
        store,
        [
          { dateISO: '2026-10-03', title: 'Passado 1', url: 'https://b2/a.mp4' },
          { dateISO: '2026-10-10', title: 'Passado 2', url: 'https://b2/b.mp4' },
          { dateISO: '2026-10-24', title: 'Futuro 1', url: 'https://b2/c.mp4' },
          { dateISO: '2026-12-26', title: 'Futuro 2', url: 'https://b2/d.mp4' },
        ],
        () => '/media/x.mp4',
        { onlyUpcoming: true },
      )
      expect(report.created).toBe(2)
      expect(report.skippedPast).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('multi-idioma — rotações separadas por edição (ADR-03, RF-04/05/06)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.clear()
  })

  const ptEps = [{ dateISO: '2026-10-03', title: 'Quem chegou à igreja aqui', url: 'https://b2/10-03-26_a.mp4' }]
  const esEps = [{ dateISO: '2026-10-03', title: 'Quiero ser como tú', url: 'https://b2/10-03-26_es.mp4' }]

  it('import com language pt usa a rotação Provai e Vede', async () => {
    const store = useScheduledStore()
    const report = await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4', { sourceLanguage: 'pt' })
    expect(store.categoryName(report.rotationId)).toBe('Provai e Vede')
  })

  it('import com language es cria rotação Probad y Ved separada mesmo na mesma data', async () => {
    const store = useScheduledStore()
    const pt = await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4', { sourceLanguage: 'pt' })
    const es = await importProvaiEVedeEpisodes(store, esEps, () => '/v/es.mp4', { sourceLanguage: 'es' })
    expect(pt.rotationId).not.toBe(es.rotationId)
    expect(store.categoryName(es.rotationId)).toBe('Probad y Ved')
    expect(store.categoryName(pt.rotationId)).toBe('Provai e Vede')
    expect(store.findOn(pt.rotationId, '2026-10-03')).toBeDefined()
    expect(store.findOn(es.rotationId, '2026-10-03')).toBeDefined()
    expect(store.items).toHaveLength(2)
  })

  it('reimportar cada edição é idempotente (não duplica)', async () => {
    const store = useScheduledStore()
    await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4', { sourceLanguage: 'pt' })
    await importProvaiEVedeEpisodes(store, esEps, () => '/v/es.mp4', { sourceLanguage: 'es' })
    const pt2 = await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4', { sourceLanguage: 'pt' })
    const es2 = await importProvaiEVedeEpisodes(store, esEps, () => '/v/es.mp4', { sourceLanguage: 'es' })
    expect(pt2.created).toBe(0)
    expect(es2.created).toBe(0)
    expect(store.items).toHaveLength(2)
    expect(store.categories.filter((c) => c.name === 'Provai e Vede')).toHaveLength(1)
    expect(store.categories.filter((c) => c.name === 'Probad y Ved')).toHaveLength(1)
  })

  it('reutiliza a rotação PT já existente criada por versão anterior (compatibilidade)', async () => {
    const store = useScheduledStore()
    store.upsertCategory({ id: 'rot-antiga', name: 'Provai e Vede' })
    const report = await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4', { sourceLanguage: 'pt' })
    expect(report.rotationId).toBe('rot-antiga')
  })

  it('sem language explícita, default pt preserva comportamento antigo dos callers', async () => {
    const store = useScheduledStore()
    const report = await importProvaiEVedeEpisodes(store, ptEps, () => '/v/pt.mp4')
    expect(store.categoryName(report.rotationId)).toBe('Provai e Vede')
  })
})
