import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useScheduledStore } from '../stores/useScheduledStore'

describe('scheduled store — promoção online_video → file (T3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('promove entry online_video a file por id quando download conclui', () => {
    const store = useScheduledStore()
    store.upsertItem({
      id: 'provai-2026-11-07-es',
      categoryId: 'provai-es',
      date: '2026-11-07',
      name: 'Probad y Ved',
      content: { kind: 'online_video', url: 'http://x/video.mp4', name: 'video.mp4' },
    })

    store.promoteOnlineVideoToFile('provai-2026-11-07-es', '/home/u/Media/provai-e-vede/video.mp4')

    const entry = store.items.find(i => i.id === 'provai-2026-11-07-es')
    expect(entry?.content?.kind).toBe('file')
    expect(entry?.content?.filePath).toBe('/home/u/Media/provai-e-vede/video.mp4')
    expect(entry?.filePath).toBe('/home/u/Media/provai-e-vede/video.mp4')
  })

  it('entry inexistente → ignora silencioso (sem throw)', () => {
    const store = useScheduledStore()
    expect(() =>
      store.promoteOnlineVideoToFile('nao-existe', '/tmp/x.mp4'),
    ).not.toThrow()
    expect(store.items.find(i => i.id === 'nao-existe')).toBeUndefined()
  })

  it('entry que não é online_video → não altera', () => {
    const store = useScheduledStore()
    store.upsertItem({
      id: 'arquivo-1',
      categoryId: 'cat',
      date: '2026-11-07',
      name: 'Arquivo',
      content: { kind: 'file', filePath: '/tmp/a.mp4' },
    })
    store.promoteOnlineVideoToFile('arquivo-1', '/tmp/outro.mp4')
    const entry = store.items.find(i => i.id === 'arquivo-1')
    expect(entry?.content?.filePath).toBe('/tmp/a.mp4')
  })

  it('usa o fileName do evento quando entry não tem filePath dedutível', () => {
    const store = useScheduledStore()
    store.upsertItem({
      id: 'sem-path',
      categoryId: 'cat',
      date: '2026-11-08',
      name: 'Vídeo',
      content: { kind: 'online_video', url: 'http://x/v.mp4', name: 'v.mp4' },
    })
    store.promoteOnlineVideoToFile('sem-path', '/home/u/Media/provai-e-vede/v.mp4')
    const entry = store.items.find(i => i.id === 'sem-path')
    expect(entry?.content?.kind).toBe('file')
  })
})
