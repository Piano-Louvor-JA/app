// @vitest-environment jsdom
// app#331 — REGRESSÃO do caminho REAL de execução (achado do crítico cego):
// o clique na liturgia NÃO chama store.open() direto — vai por
// playMusicMode → openLiturgyMusicPlayer → openMusicPlayer, que tinha
// guard musicId <= 0 rejeitando o id local (negativo) do import .slja.
// Este teste exercita a cadeia inteira como o operador usa.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { loadMediaTrackMock, fetchMock, authSessionMock } = vi.hoisted(() => ({
  loadMediaTrackMock: vi.fn(),
  fetchMock: vi.fn(),
  authSessionMock: vi.fn<() => unknown>(() => null),
}))

vi.mock('@modules/media/services/media-catalog', () => ({
  loadMediaTrack: loadMediaTrackMock,
  resolveAlbumSubtitle: () => '',
}))
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: authSessionMock,
  authHeaders: () => ({}),
}))
vi.stubGlobal('fetch', fetchMock)

import { openLiturgyMusicPlayer } from '../services/liturgy-actions'
import { useMediaStore } from '@modules/media/stores/useMediaStore'
import { importSljaAsLiturgyMusic } from '../services/import-slja-to-liturgy'
import { buildSlja, type SljaArchive } from '@shared/services/slja'
import type { LiturgyItem } from '../types/liturgy'

describe('app#331 — caminho REAL: openLiturgyMusicPlayer com item importado', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new Error('REDE BLOQUEADA no teste'))
    loadMediaTrackMock.mockReset()
    loadMediaTrackMock.mockRejectedValue(
      new Error('NÃO DEVERIA consultar o catálogo oficial pra música local'),
    )
    authSessionMock.mockReset()
    authSessionMock.mockReturnValue(null)
  })

  it('item music com musicId LOCAL toca via openLiturgyMusicPlayer (modo cantado)', async () => {
    const archive: SljaArchive = {
      title: 'Missao Para Todos',
      audio: { name: 'm.mp3', bytes: new Uint8Array([1, 2, 3]) },
      assets: [],
      slides: [{ lyric: 'Verso', type: 'LETRA', timeMs: 5_000, order: 1 }],
    }
    const imported = await importSljaAsLiturgyMusic({
      bytes: await buildSlja(archive),
      name: 'missao.slja',
    })
    expect(imported.musicId).toBeLessThan(0)

    const store = useMediaStore()
    void store

    // item EXATAMENTE como o store da liturgia monta ao salvar o draft
    const item: LiturgyItem = {
      id: 'probe-item-1',
      type: 'music',
      name: imported.name,
      subtitle: '',
      done: false,
      durationMs: imported.durationMs,
      accentColor: '#00E676',
      musicId: imported.displayMusicId,
      musicMode: 'audio',
    }

    const result = await openLiturgyMusicPlayer(item, 'audio')
    expect(result.ok).toBe(true)
    const session = useMediaStore().session
    expect(session).not.toBeNull()
    expect(session?.title).toBe('Missao Para Todos')
    expect(session?.audioUrl).toMatch(/^(data:audio|blob:)/)
    useMediaStore().close()
  })

  it('item sem música (0) continua rejeitado com mensagem clara', async () => {
    const item: LiturgyItem = {
      id: 'probe-item-2',
      type: 'music',
      name: 'Sem música',
      subtitle: '',
      done: false,
      durationMs: 0,
      accentColor: '#00E676',
      musicId: 0,
      musicMode: 'audio',
    }
    const result = await openLiturgyMusicPlayer(item, 'audio')
    expect(result.ok).toBe(false)
  })
})
