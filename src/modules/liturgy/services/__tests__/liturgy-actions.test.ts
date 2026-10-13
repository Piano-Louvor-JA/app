// @vitest-environment jsdom
// liturgy-actions — execute/play por tipo de item, external player, engines
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  openMusicPlayer: vi.fn(),
  getDesktopBridge: vi.fn<(bridge?: unknown) => unknown>(() => null),
  getLiturgyVideoObjectUrl: vi.fn(() => null),
  openLiturgyVideoControl: vi.fn(async () => true),
  openLiturgyLocalVideoControl: vi.fn(async () => true),
  openLiturgyLocalImageControl: vi.fn(async () => true),
  openLiturgyLocalPdfControl: vi.fn(async () => true),
  openLiturgyLocalPresentationControl: vi.fn(async () => true),
  openLiturgySiteControl: vi.fn(async () => true),
  openLiturgySiteOnScreens: vi.fn(async () => true),
  playLiturgyLocalVideoOnScreens: vi.fn(async () => true),
  playLiturgyLocalImageOnScreens: vi.fn(async () => true),
  playLiturgyLocalPdfOnScreens: vi.fn(async () => true),
  playLiturgyLocalPresentationOnScreens: vi.fn(async () => true),
  playLiturgyWebOnConfiguredScreens: vi.fn(async () => true),
  bibleStore: {
    books: [] as unknown[],
    bootstrap: vi.fn(async () => {}),
    selectBook: vi.fn(async () => {}),
    selectChapter: vi.fn(async () => {}),
    verseSearchQuery: '',
    applyVerseSearch: vi.fn(),
  },
}))

vi.mock('@modules/bible/stores/useBibleStore', () => ({
  useBibleStore: () => mocks.bibleStore,
}))

vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: mocks.openMusicPlayer,
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}))

vi.mock('../liturgy-local-video', () => ({
  getLiturgyVideoObjectUrl: mocks.getLiturgyVideoObjectUrl,
}))

vi.mock('../liturgy-web-projection', () => ({
  openLiturgyLocalImageControl: mocks.openLiturgyLocalImageControl,
  openLiturgyLocalPdfControl: mocks.openLiturgyLocalPdfControl,
  openLiturgyLocalPresentationControl: mocks.openLiturgyLocalPresentationControl,
  openLiturgyLocalVideoControl: mocks.openLiturgyLocalVideoControl,
  openLiturgySiteControl: mocks.openLiturgySiteControl,
  openLiturgySiteOnScreens: mocks.openLiturgySiteOnScreens,
  openLiturgyVideoControl: mocks.openLiturgyVideoControl,
  playLiturgyLocalImageOnScreens: mocks.playLiturgyLocalImageOnScreens,
  playLiturgyLocalPdfOnScreens: mocks.playLiturgyLocalPdfOnScreens,
  playLiturgyLocalPresentationOnScreens: mocks.playLiturgyLocalPresentationOnScreens,
  playLiturgyLocalVideoOnScreens: mocks.playLiturgyLocalVideoOnScreens,
  playLiturgyWebOnConfiguredScreens: mocks.playLiturgyWebOnConfiguredScreens,
}))

import {
  openLiturgyMusicPlayer,
  openLiturgyMusicOnScreens,
  executeLiturgyItem,
  playLiturgyItemOnScreens,
} from '../liturgy-actions'
import type { LiturgyItem } from '../../types/liturgy'
import type { Router } from 'vue-router'

const mocksBible = vi.hoisted(() => ({
  store: {
    books: [] as unknown[],
    bootstrap: vi.fn(async () => {}),
    selectBook: vi.fn(async () => {}),
    selectChapter: vi.fn(async () => {}),
    verseSearchQuery: '',
    applyVerseSearch: vi.fn(),
  },
}))

// reatribui referência usada no mock do store
Object.assign(mocks, {})

function litItem(partial: Partial<LiturgyItem>): LiturgyItem {
  return {
    id: 'x',
    type: 'music',
    name: 'Item',
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '#fff',
    categoryId: null,
    startTime: null,
    endTime: null,
    ...partial,
  } as LiturgyItem
}

const routerMock = {
  push: vi.fn(async () => {}),
} as unknown as Router

describe('openLiturgyMusicPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openMusicPlayer.mockResolvedValue({ ok: true })
  })

  it('musicId inválido: catalogEmpty', async () => {
    const result = await openLiturgyMusicPlayer(litItem({ type: 'music', musicId: 0 }), 'audio')
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.catalogEmpty' })
  })

  it('não-música: catalogEmpty', async () => {
    const result = await openLiturgyMusicPlayer(litItem({ type: 'verse' }), 'audio')
    expect(result.ok).toBe(false)
  })

  it('ok: repassa mode e project', async () => {
    await openLiturgyMusicPlayer(litItem({ type: 'music', musicId: 5 }), 'video', { project: true })
    expect(mocks.openMusicPlayer).toHaveBeenCalledWith({ musicId: 5, mode: 'video', project: true })
  })

  it('openMusicPlayer falha: repassa messageKey', async () => {
    mocks.openMusicPlayer.mockResolvedValue({ ok: false, messageKey: 'media.messages.x' })
    const result = await openLiturgyMusicPlayer(litItem({ type: 'music', musicId: 5 }), 'audio')
    expect(result).toEqual({ ok: false, messageKey: 'media.messages.x' })
  })

  it('warningKey vira messageKey no sucesso', async () => {
    mocks.openMusicPlayer.mockResolvedValue({ ok: true, warningKey: 'media.messages.warn' })
    const result = await openLiturgyMusicPlayer(litItem({ type: 'music', musicId: 5 }), 'audio')
    expect(result).toEqual({ ok: true, messageKey: 'media.messages.warn' })
  })

  it('openLiturgyMusicOnScreens usa musicMode do item com project', async () => {
    await openLiturgyMusicOnScreens(litItem({ type: 'music', musicId: 3, musicMode: 'audio' }))
    expect(mocks.openMusicPlayer).toHaveBeenCalledWith({ musicId: 3, mode: 'audio', project: true })
  })
})

describe('executeLiturgyItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openMusicPlayer.mockResolvedValue({ ok: true })
  })

  it('item não executável: ok true sem fazer nada', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'category' }), routerMock)
    expect(result).toEqual({ ok: true })
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('music ok: navega pra media', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'music', musicId: 1 }), routerMock)
    expect(result.ok).toBe(true)
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'media' })
  })

  it('music falha: não navega', async () => {
    mocks.openMusicPlayer.mockResolvedValue({ ok: false, messageKey: 'x' })
    const result = await executeLiturgyItem(litItem({ type: 'music', musicId: 1 }), routerMock)
    expect(result.ok).toBe(false)
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('verse sem book/chapter: ok sem navegar', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'verse' }), routerMock)
    expect(result).toEqual({ ok: true })
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('online_video sem url: urlMissing', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'online_video', url: '' }), routerMock)
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.urlMissing' })
  })

  it('online_video ok: abre controle', async () => {
    const result = await executeLiturgyItem(
      litItem({ type: 'online_video', url: 'https://youtu.be/x', name: 'Vid' }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgyVideoControl).toHaveBeenCalledWith('https://youtu.be/x', 'Vid')
  })

  it('video sem filePath nem blob: videoSelectFile', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'video', filePath: '' }), routerMock)
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.videoSelectFile' })
  })

  it('video com filePath: abre controle local', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'video', filePath: '/v.mp4' }), routerMock)
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgyLocalVideoControl).toHaveBeenCalled()
  })

  it('images sem paths: mediaDesktopOnly', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'images' }), routerMock)
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })

  it('images com paths: abre controle', async () => {
    const result = await executeLiturgyItem(
      litItem({ type: 'images', filePaths: ['/a.png'] }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgyLocalImageControl).toHaveBeenCalledWith(['/a.png'], 'Item')
  })

  it('pdf sem filePath: mediaDesktopOnly', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'pdf' }), routerMock)
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })

  it('pdf ok: abre controle', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'pdf', filePath: '/d.pdf' }), routerMock)
    expect(result.ok).toBe(true)
  })

  it('presentation engine explícita: openExternal', async () => {
    const bridge = {
      presentation: {
        getEngine: vi.fn(async () => 'auto'),
        openExternal: vi.fn(async () => ({ ok: true })),
        detectOffice: vi.fn(async () => true),
      },
    }
    mocks.getDesktopBridge.mockReturnValue(bridge as never)
    const result = await executeLiturgyItem(
      litItem({ type: 'presentation', filePath: '/p.pptx', presentationEngine: 'powerpoint' }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/p.pptx', 'powerpoint')
  })

  it('presentation engine global != auto: openExternal', async () => {
    const bridge = {
      presentation: {
        getEngine: vi.fn(async () => 'libreoffice'),
        openExternal: vi.fn(async () => ({ ok: true })),
      },
    }
    mocks.getDesktopBridge.mockReturnValue(bridge as never)
    const result = await executeLiturgyItem(
      litItem({ type: 'presentation', filePath: '/p.pptx' }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(bridge.presentation.openExternal).toHaveBeenCalledWith('/p.pptx', 'libreoffice')
  })

  it('presentation auto sem office: presentationOfficeMissing', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      presentation: {
        detectOffice: vi.fn(async () => false),
      },
    } as never)
    const result = await executeLiturgyItem(
      litItem({ type: 'presentation', filePath: '/p.pptx' }),
      routerMock,
    )
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.presentationOfficeMissing' })
  })

  it('presentation auto com office: abre controle interno', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      presentation: { detectOffice: vi.fn(async () => true) },
    } as never)
    const result = await executeLiturgyItem(
      litItem({ type: 'presentation', filePath: '/p.pptx' }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgyLocalPresentationControl).toHaveBeenCalled()
  })

  it('site ok: abre controle', async () => {
    const result = await executeLiturgyItem(
      litItem({ type: 'site', url: 'https://exemplo.com' }),
      routerMock,
    )
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgySiteControl).toHaveBeenCalled()
  })

  it('other_files: mediaDesktopOnly', async () => {
    const result = await executeLiturgyItem(litItem({ type: 'other_files' }), routerMock)
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })
})

describe('playLiturgyItemOnScreens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('music: delega pro openLiturgyMusicOnScreens', async () => {
    mocks.openMusicPlayer.mockResolvedValue({ ok: true })
    const result = await playLiturgyItemOnScreens(litItem({ type: 'music', musicId: 2 }))
    expect(result.ok).toBe(true)
  })

  it('video sem filePath: mediaDesktopOnly', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'video', filePath: '' }))
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })

  it('video ok: playLiturgyLocalVideoOnScreens', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'video', filePath: '/v.mp4' }))
    expect(result.ok).toBe(true)
    expect(mocks.playLiturgyLocalVideoOnScreens).toHaveBeenCalled()
  })

  it('video falha na projeção: projectionFailed', async () => {
    mocks.playLiturgyLocalVideoOnScreens.mockResolvedValue(false)
    const result = await playLiturgyItemOnScreens(litItem({ type: 'video', filePath: '/v.mp4' }))
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })

  it('images ok', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'images', filePaths: ['/a.png'] }))
    expect(result.ok).toBe(true)
    expect(mocks.playLiturgyLocalImageOnScreens).toHaveBeenCalled()
  })

  it('pdf ok', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'pdf', filePath: '/d.pdf' }))
    expect(result.ok).toBe(true)
    expect(mocks.playLiturgyLocalPdfOnScreens).toHaveBeenCalled()
  })

  it('presentation auto: playLiturgyLocalPresentationOnScreens', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      presentation: { detectOffice: vi.fn(async () => true) },
    } as never)
    const result = await playLiturgyItemOnScreens(litItem({ type: 'presentation', filePath: '/p.pptx' }))
    expect(result.ok).toBe(true)
    expect(mocks.playLiturgyLocalPresentationOnScreens).toHaveBeenCalledWith('/p.pptx', 'Item', 'auto')
  })

  it('site: openLiturgySiteOnScreens', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'site', url: 'https://x.com' }))
    expect(result.ok).toBe(true)
    expect(mocks.openLiturgySiteOnScreens).toHaveBeenCalled()
  })

  it('online_video: playLiturgyWebOnConfiguredScreens', async () => {
    const result = await playLiturgyItemOnScreens(
      litItem({ type: 'online_video', url: 'https://youtu.be/1' }),
    )
    expect(result.ok).toBe(true)
    expect(mocks.playLiturgyWebOnConfiguredScreens).toHaveBeenCalled()
  })

  it('web sem url: urlMissing', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'site', url: ' ' }))
    expect(result).toEqual({ ok: false, messageKey: 'liturgy.messages.urlMissing' })
  })

  it('tipo não-web e não-mídia (verse): ok true', async () => {
    const result = await playLiturgyItemOnScreens(litItem({ type: 'verse' }))
    expect(result).toEqual({ ok: true })
  })
})
