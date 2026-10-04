// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de open-music-player.ts — validação de musicId, repasse do
 * project sem resolver e maximize no sucesso.
 */

const openMock = vi.fn()
const maximizeMock = vi.fn()

vi.mock('../../stores/useMediaStore', () => ({
  useMediaStore: () => ({
    open: (...a: unknown[]) => openMock(...(a as [])),
    maximize: () => maximizeMock(),
  }),
}))

import { openMusicPlayer } from '../open-music-player'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openMusicPlayer', () => {
  it('musicId inválido (0, NaN, negativo) -> trackMissing sem tocar no store', async () => {
    expect(await openMusicPlayer({ musicId: 0, mode: 'audio' })).toMatchObject({
      ok: false,
      messageKey: 'media.messages.trackMissing',
    })
    expect(await openMusicPlayer({ musicId: Number.NaN, mode: 'audio' })).toMatchObject({
      ok: false,
    })
    expect(await openMusicPlayer({ musicId: -3, mode: 'audio' })).toMatchObject({
      ok: false,
    })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('ok: repassa project/albumId, maximiza e retorna resultado', async () => {
    openMock.mockResolvedValue({ ok: true, warningKey: 'media.messages.w' })
    const r = await openMusicPlayer({
      musicId: 5,
      mode: 'instrumental',
      albumId: 3,
      project: true,
    })
    expect(openMock).toHaveBeenCalledWith({
      musicId: 5,
      mode: 'instrumental',
      albumId: 3,
      minimized: false,
      project: true,
    })
    expect(maximizeMock).toHaveBeenCalled()
    expect(r).toEqual({ ok: true, warningKey: 'media.messages.w' })
  })

  it('project undefined repassa undefined (opt-out do store resolve); albumId ausente -> null', async () => {
    openMock.mockResolvedValue({ ok: true })
    await openMusicPlayer({ musicId: 5, mode: 'no_audio' })
    expect(openMock).toHaveBeenCalledWith({
      musicId: 5,
      mode: 'no_audio',
      albumId: null,
      minimized: false,
      project: undefined,
    })
  })

  it('store falha: retorna erro SEM maximizar', async () => {
    openMock.mockResolvedValue({ ok: false, messageKey: 'media.messages.trackMissing' })
    const r = await openMusicPlayer({ musicId: 5, mode: 'audio' })
    expect(r.ok).toBe(false)
    expect(maximizeMock).not.toHaveBeenCalled()
  })
})
