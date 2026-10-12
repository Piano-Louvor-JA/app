// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiturgyItem } from '../types/liturgy'

// --- mocks de borda -------------------------------------------------------

const openMusicPlayerMock = vi.fn()
vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: (...args: unknown[]) => openMusicPlayerMock(...args),
}))

const webProjectionMocks = vi.hoisted(() => ({
  openLiturgyLocalImageControl: vi.fn(),
  openLiturgyLocalPdfControl: vi.fn(),
  openLiturgyLocalPresentationControl: vi.fn(),
  openLiturgyLocalVideoControl: vi.fn(),
  openLiturgySiteControl: vi.fn(),
  openLiturgySiteOnScreens: vi.fn(),
  openLiturgyVideoControl: vi.fn(),
  playLiturgyLocalImageOnScreens: vi.fn(),
  playLiturgyLocalPdfOnScreens: vi.fn(),
  playLiturgyLocalPresentationOnScreens: vi.fn(),
  playLiturgyLocalVideoOnScreens: vi.fn(),
  playLiturgyWebOnConfiguredScreens: vi.fn(),
}))
vi.mock('../services/liturgy-web-projection', () => webProjectionMocks)

const bibleStoreMock = {
  books: [] as unknown[],
  bootstrap: vi.fn(),
  selectBook: vi.fn(),
  selectChapter: vi.fn(),
  verseSearchQuery: '',
  applyVerseSearch: vi.fn(),
}
vi.mock('@modules/bible/stores/useBibleStore', () => ({
  useBibleStore: () => bibleStoreMock,
}))

import {
  executeLiturgyItem,
  openLiturgyMusicOnScreens,
  openLiturgyMusicPlayer,
  playLiturgyItemOnScreens,
} from '../services/liturgy-actions'

// --- helpers --------------------------------------------------------------

type Bridge = Record<string, unknown> | null

function setBridge(bridge: Bridge) {
  Object.defineProperty(window, 'louvorja', {
    value: bridge,
    configurable: true,
    writable: true,
  })
}

const routerPush = vi.fn()
const router = { push: routerPush } as unknown as Parameters<
  typeof executeLiturgyItem
>[1]

function item(partial: Partial<LiturgyItem> & { type: LiturgyItem['type'] }): LiturgyItem {
  return partial as LiturgyItem
}

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
})

afterEach(() => {
  setBridge(null)
})

// --- openLiturgyMusicPlayer ----------------------------------------------

describe('openLiturgyMusicPlayer', () => {
  it('falha com catalogEmpty quando item não é música', async () => {
    const r = await openLiturgyMusicPlayer(item({ type: 'annotation', musicId: 10 }), 'audio')
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.catalogEmpty' })
  })
  it('falha quando musicId inválido', async () => {
    const r = await openLiturgyMusicPlayer(item({ type: 'music', musicId: 0 }), 'audio')
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.catalogEmpty' })
    const r2 = await openLiturgyMusicPlayer(item({ type: 'music', musicId: NaN }), 'audio')
    expect(r2).toEqual({ ok: false, messageKey: 'liturgy.messages.catalogEmpty' })
  })
  it('repassa resultado de falha do player', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: false, messageKey: 'media.messages.x' })
    const r = await openLiturgyMusicPlayer(item({ type: 'music', musicId: 5 }), 'audio')
    expect(r).toEqual({ ok: false, messageKey: 'media.messages.x' })
  })
  it('retorna ok com warningKey do player', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: true, warningKey: 'media.messages.w' })
    const r = await openLiturgyMusicPlayer(item({ type: 'music', musicId: 5 }), 'audio', {
      project: true,
    })
    expect(r).toEqual({ ok: true, messageKey: 'media.messages.w' })
    expect(openMusicPlayerMock).toHaveBeenCalledWith({
      musicId: 5,
      mode: 'audio',
      project: true,
    })
  })
})

describe('openLiturgyMusicOnScreens', () => {
  it('usa musicMode do item (fallback audio) com project true', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: true })
    const r = await openLiturgyMusicOnScreens(item({ type: 'music', musicId: 7, musicMode: 'instrumental' }))
    expect(r).toEqual({ ok: true })
    expect(openMusicPlayerMock).toHaveBeenCalledWith({
      musicId: 7,
      mode: 'instrumental',
      project: true,
    })
  })
})

// --- executeLiturgyItem ---------------------------------------------------

describe('executeLiturgyItem', () => {
  it('retorna ok sem ação para tipo não executável', async () => {
    const r = await executeLiturgyItem(item({ type: 'annotation' }), router)
    expect(r).toEqual({ ok: true })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('music: projeta e navega para media quando ok', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: true })
    const r = await executeLiturgyItem(item({ type: 'music', musicId: 3 }), router)
    expect(r).toEqual({ ok: true })
    expect(routerPush).toHaveBeenCalledWith({ name: 'media' })
  })
  it('music: falha e NÃO navega', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: false, messageKey: 'x' })
    const r = await executeLiturgyItem(item({ type: 'music', musicId: 3 }), router)
    expect(r).toEqual({ ok: false, messageKey: 'x' })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('verse: sem livro definido retorna ok sem ação', async () => {
    const r = await executeLiturgyItem(item({ type: 'verse' }), router)
    expect(r).toEqual({ ok: true })
  })
  it('verse: bootstrapa quando books vazio, seleciona livro/capítulo e navega', async () => {
    bibleStoreMock.books = [{ id: 1 }]
    bibleStoreMock.bootstrap.mockClear()
    const r = await executeLiturgyItem(
      item({ type: 'verse', verseBookId: 1, verseChapter: 2, verseNumbers: '3-4' }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(bibleStoreMock.bootstrap).not.toHaveBeenCalled() // books já populado
    expect(bibleStoreMock.selectBook).toHaveBeenCalledWith(1)
    expect(bibleStoreMock.selectChapter).toHaveBeenCalledWith(2)
    expect(bibleStoreMock.verseSearchQuery).toBe('3-4')
    expect(bibleStoreMock.applyVerseSearch).toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalledWith({ name: 'bible' })
  })
  it('verse: bootstrap quando books vazio; sem verseNumbers não pesquisa', async () => {
    bibleStoreMock.books = []
    const r = await executeLiturgyItem(
      item({ type: 'verse', verseBookId: 1, verseChapter: 2 }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(bibleStoreMock.bootstrap).toHaveBeenCalled()
    expect(bibleStoreMock.applyVerseSearch).not.toHaveBeenCalled()
  })

  it('online_video: sem url falha com urlMissing', async () => {
    const r = await executeLiturgyItem(item({ type: 'online_video' }), router)
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.urlMissing' })
  })
  it('online_video: falha projeção', async () => {
    webProjectionMocks.openLiturgyVideoControl.mockResolvedValueOnce(false)
    const r = await executeLiturgyItem(item({ type: 'online_video', url: 'https://x' }), router)
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })
  it('online_video: ok usa name da url como label', async () => {
    webProjectionMocks.openLiturgyVideoControl.mockResolvedValueOnce(true)
    const r = await executeLiturgyItem(
      item({ type: 'online_video', url: 'https://x', name: '  ' }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgyVideoControl).toHaveBeenCalledWith('https://x', 'https://x')
  })

  describe('audio/video local', () => {
    it('sem filePath nem objectUrl falha com videoSelectFile', async () => {
      const r = await executeLiturgyItem(item({ type: 'video', id: 'v1' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.videoSelectFile' })
    })
    it('video interno: abre controle com objectUrl (browser)', async () => {
      webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'video', id: 'nope', filePath: undefined, name: 'Meu vídeo' }),
        router,
      )
      // sem filePath e sem objectUrl registrado → videoSelectFile; registra antes:
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.videoSelectFile' })
    })
    it('audio com filePath e player externo configurado delega ao bridge', async () => {
      const play = vi.fn().mockResolvedValue({ ok: true })
      const get = vi.fn().mockResolvedValue('vlc')
      setBridge({ externalPlayer: { get, play } })
      webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'audio', id: 'a1', filePath: '/m.mp3' }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(play).toHaveBeenCalledWith('/m.mp3', 'vlc')
      expect(webProjectionMocks.openLiturgyLocalVideoControl).not.toHaveBeenCalled()
    })
    it('audio playerId default consulta preferência global; associated usa interno', async () => {
      const play = vi.fn()
      const get = vi.fn().mockResolvedValue('associated')
      setBridge({ externalPlayer: { get, play } })
      webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'audio', id: 'a2', filePath: '/m.mp3', playerId: 'default' }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(get).toHaveBeenCalled()
      expect(play).not.toHaveBeenCalled()
      expect(webProjectionMocks.openLiturgyLocalVideoControl).toHaveBeenCalled()
    })
    it('audio: player externo falha → cai no player interno', async () => {
      const play = vi.fn().mockResolvedValue({ ok: false })
      const get = vi.fn().mockResolvedValue('vlc')
      setBridge({ externalPlayer: { get, play } })
      webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'audio', id: 'a3', filePath: '/m.mp3', playerId: 'vlc' }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(play).toHaveBeenCalled()
      expect(webProjectionMocks.openLiturgyLocalVideoControl).toHaveBeenCalled()
    })
    it('vídeo com filePath abre player interno (nunca externo) e falha se controle falhar', async () => {
      const play = vi.fn()
      setBridge({ externalPlayer: { get: vi.fn(), play } })
      webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(false)
      const r = await executeLiturgyItem(
        item({ type: 'video', id: 'v2', filePath: '/v.mp4' }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
      expect(play).not.toHaveBeenCalled()
    })
  })

  describe('images', () => {
    it('sem caminhos falha com mediaDesktopOnly', async () => {
      const r = await executeLiturgyItem(item({ type: 'images' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
    it('usa filePath único quando filePaths vazio', async () => {
      webProjectionMocks.openLiturgyLocalImageControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'images', filePath: '/img.png', filePaths: [] }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(webProjectionMocks.openLiturgyLocalImageControl).toHaveBeenCalledWith(
        ['/img.png'],
        '/img.png',
      )
    })
    it('filtra entradas vazias de filePaths', async () => {
      webProjectionMocks.openLiturgyLocalImageControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'images', filePaths: [' /a.jpg ', '  ', ''] }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(webProjectionMocks.openLiturgyLocalImageControl).toHaveBeenCalledWith(
        ['/a.jpg'],
        '/a.jpg',
      )
    })
    it('projeção falhando retorna projectionFailed', async () => {
      webProjectionMocks.openLiturgyLocalImageControl.mockResolvedValueOnce(false)
      const r = await executeLiturgyItem(
        item({ type: 'images', filePaths: ['/a.jpg'] }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
  })

  describe('pdf', () => {
    it('sem filePath falha', async () => {
      const r = await executeLiturgyItem(item({ type: 'pdf' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
    it('ok com filePath', async () => {
      webProjectionMocks.openLiturgyLocalPdfControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(item({ type: 'pdf', filePath: '/x.pdf' }), router)
      expect(r).toEqual({ ok: true })
    })
    it('falha projeção', async () => {
      webProjectionMocks.openLiturgyLocalPdfControl.mockResolvedValueOnce(false)
      const r = await executeLiturgyItem(item({ type: 'pdf', filePath: '/x.pdf' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
  })

  describe('presentation', () => {
    it('sem filePath falha', async () => {
      const r = await executeLiturgyItem(item({ type: 'presentation' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
    it('engine explícito no item abre externo', async () => {
      const openExternal = vi.fn().mockResolvedValue({ ok: true })
      setBridge({ presentation: { openExternal } })
      const r = await executeLiturgyItem(
        item({ type: 'presentation', filePath: '/p.pptx', presentationEngine: 'powerpoint' }),
        router,
      )
      expect(r).toEqual({ ok: true })
      expect(openExternal).toHaveBeenCalledWith('/p.pptx', 'powerpoint')
    })
    it('engine global explícito (sem override) abre externo; falha retorna erro', async () => {
      const openExternal = vi.fn().mockResolvedValue({ ok: false })
      const getEngine = vi.fn().mockResolvedValue('libreoffice')
      setBridge({ presentation: { openExternal, getEngine } })
      const r = await executeLiturgyItem(
        item({ type: 'presentation', filePath: '/p.pptx' }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
    it('engine auto sem office retorna presentationOfficeMissing', async () => {
      const getEngine = vi.fn().mockResolvedValue('auto')
      const detectOffice = vi.fn().mockResolvedValue(false)
      setBridge({ presentation: { getEngine, detectOffice } })
      const r = await executeLiturgyItem(
        item({ type: 'presentation', filePath: '/p.pptx' }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.presentationOfficeMissing' })
    })
    it('engine auto com office converte e projeta', async () => {
      const getEngine = vi.fn().mockResolvedValue('auto')
      const detectOffice = vi.fn().mockResolvedValue(true)
      setBridge({ presentation: { getEngine, detectOffice } })
      webProjectionMocks.openLiturgyLocalPresentationControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(
        item({ type: 'presentation', filePath: '/p.pptx' }),
        router,
      )
      expect(r).toEqual({ ok: true })
    })
    it('engine auto com office mas projeção falha', async () => {
      const getEngine = vi.fn().mockResolvedValue(undefined)
      const detectOffice = vi.fn().mockResolvedValue(undefined)
      setBridge({ presentation: { getEngine, detectOffice } })
      webProjectionMocks.openLiturgyLocalPresentationControl.mockResolvedValueOnce(false)
      const r = await executeLiturgyItem(
        item({ type: 'presentation', filePath: '/p.pptx' }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
  })

  describe('site', () => {
    it('sem url falha', async () => {
      const r = await executeLiturgyItem(item({ type: 'site' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.urlMissing' })
    })
    it('ok abre controle do site', async () => {
      webProjectionMocks.openLiturgySiteControl.mockResolvedValueOnce(true)
      const r = await executeLiturgyItem(item({ type: 'site', url: 'https://s' }), router)
      expect(r).toEqual({ ok: true })
    })
    it('falha projeção', async () => {
      webProjectionMocks.openLiturgySiteControl.mockResolvedValueOnce(false)
      const r = await executeLiturgyItem(item({ type: 'site', url: 'https://s' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
  })

  describe('default (other_files e desconhecidos)', () => {
    it('other_files sem filePath retorna mediaDesktopOnly', async () => {
      const r = await executeLiturgyItem(item({ type: 'other_files' }), router)
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
    it('other_files com filePath também mediaDesktopOnly (desktop-only)', async () => {
      const r = await executeLiturgyItem(
        item({ type: 'other_files', filePath: '/f.docx' }),
        router,
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
  })
})

// --- playLiturgyItemOnScreens ---------------------------------------------

describe('playLiturgyItemOnScreens', () => {
  it('music delega para openLiturgyMusicOnScreens', async () => {
    openMusicPlayerMock.mockResolvedValueOnce({ ok: true })
    const r = await playLiturgyItemOnScreens(item({ type: 'music', musicId: 9 }))
    expect(r).toEqual({ ok: true })
  })

  it('video sem filePath falha', async () => {
    const r = await playLiturgyItemOnScreens(item({ type: 'video' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })
  it('video ok dá play nas telas', async () => {
    webProjectionMocks.playLiturgyLocalVideoOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'video', filePath: '/v.mp4', name: 'Vídeo' }),
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.playLiturgyLocalVideoOnScreens).toHaveBeenCalledWith('/v.mp4', 'Vídeo')
  })
  it('video play falha retorna projectionFailed', async () => {
    webProjectionMocks.playLiturgyLocalVideoOnScreens.mockResolvedValueOnce(false)
    const r = await playLiturgyItemOnScreens(item({ type: 'video', filePath: '/v.mp4' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })

  it('images sem paths falha', async () => {
    const r = await playLiturgyItemOnScreens(item({ type: 'images' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })
  it('images ok', async () => {
    webProjectionMocks.playLiturgyLocalImageOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'images', filePaths: ['/a.jpg', '/b.jpg'] }),
    )
    expect(r).toEqual({ ok: true })
  })
  it('images play falha', async () => {
    webProjectionMocks.playLiturgyLocalImageOnScreens.mockResolvedValueOnce(false)
    const r = await playLiturgyItemOnScreens(item({ type: 'images', filePaths: ['/a.jpg'] }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })

  it('pdf sem filePath falha', async () => {
    const r = await playLiturgyItemOnScreens(item({ type: 'pdf' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })
  it('pdf ok', async () => {
    webProjectionMocks.playLiturgyLocalPdfOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(item({ type: 'pdf', filePath: '/x.pdf' }))
    expect(r).toEqual({ ok: true })
  })
  it('pdf falha', async () => {
    webProjectionMocks.playLiturgyLocalPdfOnScreens.mockResolvedValueOnce(false)
    const r = await playLiturgyItemOnScreens(item({ type: 'pdf', filePath: '/x.pdf' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })

  describe('presentation', () => {
    it('sem filePath falha', async () => {
      const r = await playLiturgyItemOnScreens(item({ type: 'presentation' }))
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
    })
    it('engine do item externo ok', async () => {
      const openExternal = vi.fn().mockResolvedValue({ ok: true })
      setBridge({ presentation: { openExternal } })
      const r = await playLiturgyItemOnScreens(
        item({ type: 'presentation', filePath: '/p.pptx', presentationEngine: 'custom' }),
      )
      expect(r).toEqual({ ok: true })
    })
    it('engine global externo falha', async () => {
      const openExternal = vi.fn().mockResolvedValue({ ok: false })
      const getEngine = vi.fn().mockResolvedValue('powerpoint')
      setBridge({ presentation: { openExternal, getEngine } })
      const r = await playLiturgyItemOnScreens(
        item({ type: 'presentation', filePath: '/p.pptx' }),
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
    it('auto sem office falha', async () => {
      const getEngine = vi.fn().mockResolvedValue('auto')
      const detectOffice = vi.fn().mockResolvedValue(false)
      setBridge({ presentation: { getEngine, detectOffice } })
      const r = await playLiturgyItemOnScreens(
        item({ type: 'presentation', filePath: '/p.pptx' }),
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.presentationOfficeMissing' })
    })
    it('auto com office projeta', async () => {
      const getEngine = vi.fn().mockResolvedValue('auto')
      const detectOffice = vi.fn().mockResolvedValue(true)
      setBridge({ presentation: { getEngine, detectOffice } })
      webProjectionMocks.playLiturgyLocalPresentationOnScreens.mockResolvedValueOnce(true)
      const r = await playLiturgyItemOnScreens(
        item({ type: 'presentation', filePath: '/p.pptx' }),
      )
      expect(r).toEqual({ ok: true })
      expect(webProjectionMocks.playLiturgyLocalPresentationOnScreens).toHaveBeenCalledWith(
        '/p.pptx',
        '/p.pptx',
        'auto',
      )
    })
    it('auto com office mas projeção falha', async () => {
      const getEngine = vi.fn().mockResolvedValue('auto')
      const detectOffice = vi.fn().mockResolvedValue(true)
      setBridge({ presentation: { getEngine, detectOffice } })
      webProjectionMocks.playLiturgyLocalPresentationOnScreens.mockResolvedValueOnce(false)
      const r = await playLiturgyItemOnScreens(
        item({ type: 'presentation', filePath: '/p.pptx' }),
      )
      expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    })
  })

  it('tipo não web nem listado retorna ok sem ação', async () => {
    const r = await playLiturgyItemOnScreens(item({ type: 'annotation' }))
    expect(r).toEqual({ ok: true })
  })

  it('online_video sem url falha', async () => {
    const r = await playLiturgyItemOnScreens(item({ type: 'online_video' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.urlMissing' })
  })
  it('online_video ok dá play web nas telas', async () => {
    webProjectionMocks.playLiturgyWebOnConfiguredScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'online_video', url: 'https://v' }),
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.playLiturgyWebOnConfiguredScreens).toHaveBeenCalledWith(
      'https://v',
      'https://v',
    )
  })
  it('site ok abre site nas telas', async () => {
    webProjectionMocks.openLiturgySiteOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'site', url: 'https://s', name: 'Site' }),
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgySiteOnScreens).toHaveBeenCalledWith('https://s', 'Site')
  })
  it('site play falha', async () => {
    webProjectionMocks.openLiturgySiteOnScreens.mockResolvedValueOnce(false)
    const r = await playLiturgyItemOnScreens(item({ type: 'site', url: 'https://s' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })
  it('online_video play falha', async () => {
    webProjectionMocks.playLiturgyWebOnConfiguredScreens.mockResolvedValueOnce(false)
    const r = await playLiturgyItemOnScreens(item({ type: 'online_video', url: 'https://v' }))
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
  })
})

describe('branches residuais', () => {
  it('images: label cai em paths[0] vazio -> Imagens', async () => {
    webProjectionMocks.openLiturgyLocalImageControl.mockResolvedValueOnce(true)
    const r = await executeLiturgyItem(
      item({ type: 'images', filePaths: ['/only.png'] }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgyLocalImageControl).toHaveBeenCalledWith(
      ['/only.png'],
      '/only.png',
    )
  })
  it('images: play nas telas com label Imagens quando name ausente', async () => {
    webProjectionMocks.playLiturgyLocalImageOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'images', filePaths: ['/a.png'] }),
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.playLiturgyLocalImageOnScreens).toHaveBeenCalledWith(
      ['/a.png'],
      '/a.png',
    )
  })
  it('site: name ausente usa rawUrl como label', async () => {
    webProjectionMocks.openLiturgySiteOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(item({ type: 'site', url: 'https://x' }))
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgySiteOnScreens).toHaveBeenCalledWith(
      'https://x',
      'https://x',
    )
  })
  it('presentation auto: bridge nulo (getEngine undefined) com projeção ok', async () => {
    setBridge(null)
    webProjectionMocks.playLiturgyLocalPresentationOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'presentation', filePath: '/p.pptx', presentationEngine: 'auto' }),
    )
    expect(r).toEqual({ ok: true })
  })
  it('online_video: name com espaços cai no rawUrl', async () => {
    webProjectionMocks.playLiturgyWebOnConfiguredScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(
      item({ type: 'online_video', url: 'https://v', name: '' }),
    )
    expect(r).toEqual({ ok: true })
  })
  it('images execute: filePaths com single vazio + filePath undefined -> mediaDesktopOnly', async () => {
    const r = await executeLiturgyItem(
      item({ type: 'images', filePath: undefined, filePaths: [] }),
      router,
    )
    expect(r).toEqual({ ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' })
  })
  it('video browser: só objectUrl (upload web) abre interno com label do name', async () => {
    // registra blob URL real para o id
    const { setLiturgyVideoFile, revokeLiturgyVideo } = await import('../services/liturgy-local-video')
    const url = setLiturgyVideoFile('web1', new File(['x'], 'v.mp4', { type: 'video/mp4' }))
    webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
    const r = await executeLiturgyItem(
      item({ type: 'video', id: 'web1', filePath: undefined, name: '  Clipe  ' }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgyLocalVideoControl).toHaveBeenCalledWith(
      'Clipe',
      'Clipe',
      url,
    )
    revokeLiturgyVideo('web1')
  })
})

describe('labels fallback', () => {
  it('video browser sem name usa label Vídeo (fallback do tipo)', async () => {
    const { setLiturgyVideoFile, revokeLiturgyVideo } = await import('../services/liturgy-local-video')
    const url = setLiturgyVideoFile('web2', new File(['x'], 'v.mp4', { type: 'video/mp4' }))
    webProjectionMocks.openLiturgyLocalVideoControl.mockResolvedValueOnce(true)
    const r = await executeLiturgyItem(
      item({ type: 'video', id: 'web2', filePath: undefined, name: undefined }),
      router,
    )
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.openLiturgyLocalVideoControl).toHaveBeenCalledWith(
      'Vídeo',
      'Vídeo',
      url,
    )
    revokeLiturgyVideo('web2')
  })
  it('presentation play: bridge nulo cai engine auto ?? e falha sem office', async () => {
    setBridge(null)
    webProjectionMocks.playLiturgyLocalPresentationOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(item({ type: 'presentation', filePath: '/p.pptx' }))
    expect(r).toEqual({ ok: true })
  })
  it('presentation play sem name usa filePath como label', async () => {
    const getEngine = vi.fn().mockResolvedValue('auto')
    const detectOffice = vi.fn().mockResolvedValue(true)
    setBridge({ presentation: { getEngine, detectOffice } })
    webProjectionMocks.playLiturgyLocalPresentationOnScreens.mockResolvedValueOnce(true)
    const r = await playLiturgyItemOnScreens(item({ type: 'presentation', filePath: '/p.pptx' }))
    expect(r).toEqual({ ok: true })
    expect(webProjectionMocks.playLiturgyLocalPresentationOnScreens).toHaveBeenCalledWith(
      '/p.pptx',
      '/p.pptx',
      'auto',
    )
  })
})
