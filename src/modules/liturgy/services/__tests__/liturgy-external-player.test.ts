// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Player externo na liturgia (Rafael 03/10): VÍDEO local também respeita a
 * preferência do usuário (VLC/mpv) — antes só áudio entrava no caminho do
 * player externo e vídeo ia SEMPRE pro controle interno.
 *
 * Contrato:
 * - item.video com playerId externo (ou preferência global externa) + filePath
 *   → externalPlayer.play(filePath, pref) e NÃO abre controle interno
 * - pref 'associated' (ou default+global associated) → controle interno
 * - browser (sem bridge/sem filePath, só objectUrl) → controle interno web
 * - externalPlayer.play falha → cai no controle interno
 * - item.playerId explícito vence a preferência global
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  get: vi.fn(),
  openControl: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => ({
    externalPlayer: { play: mocks.play, get: mocks.get },
  }),
}))

vi.mock('../liturgy-web-projection', () => ({
  openLiturgyLocalVideoControl: mocks.openControl,
  openLiturgyVideoControl: mocks.openControl,
  openLiturgySiteControl: mocks.openControl,
}))

import { executeLiturgyItem } from '../liturgy-actions'

function videoItem(overrides: Partial<Parameters<typeof executeLiturgyItem>[0]> = {}) {
  return {
    id: 'v1',
    type: 'video' as const,
    name: 'Vídeo do Culto',
    filePath: '/media/videos/culto.mp4',
    ...overrides,
  }
}

describe('player externo na liturgia — vídeo (regressão 03/10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.play.mockResolvedValue({ ok: true })
    mocks.openControl.mockResolvedValue(true)
  })

  it('vídeo + preferência externa → externalPlayer.play, sem controle interno', async () => {
    mocks.get.mockResolvedValue('vlc')
    const result = await executeLiturgyItem(videoItem(), {} as never)
    expect(result.ok).toBe(true)
    expect(mocks.play).toHaveBeenCalledWith('/media/videos/culto.mp4', 'vlc')
    expect(mocks.openControl).not.toHaveBeenCalled()
  })

  it('vídeo + playerId do item vence a preferência global', async () => {
    mocks.get.mockResolvedValue('mpv')
    await executeLiturgyItem(videoItem({ playerId: 'vlc' }), {} as never)
    expect(mocks.play).toHaveBeenCalledWith('/media/videos/culto.mp4', 'vlc')
  })

  it('vídeo + associated → controle interno (sem play externo)', async () => {
    mocks.get.mockResolvedValue('associated')
    await executeLiturgyItem(videoItem(), {} as never)
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.openControl).toHaveBeenCalled()
  })

  it('vídeo + play externo FALHA → cai no controle interno', async () => {
    mocks.get.mockResolvedValue('vlc')
    mocks.play.mockResolvedValue({ ok: false })
    await executeLiturgyItem(videoItem(), {} as never)
    expect(mocks.play).toHaveBeenCalled()
    expect(mocks.openControl).toHaveBeenCalled()
  })

  it('áudio continua no caminho do player externo (comportamento preservado)', async () => {
    mocks.get.mockResolvedValue('vlc')
    const result = await executeLiturgyItem(
      videoItem({ type: 'audio', name: 'Áudio' }),
      {} as never,
    )
    expect(result.ok).toBe(true)
    expect(mocks.play).toHaveBeenCalled()
    expect(mocks.openControl).not.toHaveBeenCalled()
  })
})

describe('player externo na liturgia — arquivo de outra máquina', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openControl.mockResolvedValue(true)
  })

  it('file-missing → erro claro, SEM cair no controle interno (path de outra máquina)', async () => {
    mocks.get.mockResolvedValue('vlc')
    mocks.play.mockResolvedValue({ ok: false, player: 'none', error: 'file-missing' })
    const result = await executeLiturgyItem(videoItem(), {} as never)
    expect(result.ok).toBe(false)
    expect(result.messageKey).toBe('liturgy.messages.fileMissingOnMachine')
    expect(mocks.openControl).not.toHaveBeenCalled()
  })
})

describe('isolamento — YouTube/site NUNCA vão pro player externo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.play.mockResolvedValue({ ok: true })
    mocks.openControl.mockResolvedValue(true)
    mocks.get.mockResolvedValue('vlc')
  })

  it('online_video (YouTube) + VLC selecionado → controle interno, sem play externo', async () => {
    const result = await executeLiturgyItem(
      {
        id: 'yt1',
        type: 'online_video',
        name: 'Vídeo YouTube',
        url: 'https://youtube.com/watch?v=abc',
      } as never,
      {} as never,
    )
    expect(result.ok).toBe(true)
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.openControl).toHaveBeenCalled()
  })

  it('site + VLC selecionado → controle do site, sem play externo', async () => {
    const result = await executeLiturgyItem(
      {
        id: 'site1',
        type: 'site',
        name: 'Site',
        url: 'https://example.com',
      } as never,
      {} as never,
    )
    expect(result.ok).toBe(true)
    expect(mocks.play).not.toHaveBeenCalled()
  })
})
