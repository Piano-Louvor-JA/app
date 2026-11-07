// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn(() => []) }),
  screen: { getAllDisplays: vi.fn(() => []), getPrimaryDisplay: vi.fn(() => ({ id: 1 })) },
  session: { defaultSession: {} },
  WebContentsView: vi.fn(),
  app: { getPath: vi.fn(() => '/tmp') },
  net: {},
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn() },
  powerSaveBlocker: { start: vi.fn(), stop: vi.fn() },
}))
vi.mock('../workspace.mjs', () => ({ readWorkspaceRecord: vi.fn(), writeWorkspaceRecord: vi.fn() }))
vi.mock('../palco-server.mjs', () => ({ getPalcoManager: vi.fn(() => null) }))
vi.mock('./../ipc/presentation-convert.mjs', () => ({ convertPresentationToPdf: vi.fn() }))

const {
  YOUTUBE_PLAYBACK_PROBE_SCRIPT,
  fallbackWhenYoutubeFails,
  getSourceMediaInfo,
  resolveOnlineVideoPlayerUrl,
  resolveSourceUrl,
  setOnlineVideoPlayer,
  startYoutubeSource,
  watchYoutubePlayback,
} = await import('../ipc/web-projection.mjs')

const ID = 'aaaaaaaaaaa'
const CLOSED_ID = 'bbbbbbbbbbb'
const DEFAULT_ID = 'ccccccccccc'

describe('cópia local do YouTube na projeção', () => {
  it('trilhas baixando: player local com imagem, som, legenda e título', async () => {
    const player = {
      play: vi.fn(async () => ({
        kind: 'stream',
        src: `local://yt-stream/${ID}/video`,
        audioSrc: `local://yt-stream/${ID}/audio`,
        subtitle: `local://yt-cache/${ID}.vtt`,
        title: 'Hino',
      })),
      release: vi.fn(),
    }
    const url = new URL(await resolveOnlineVideoPlayerUrl(ID, player))
    expect(url.protocol).toBe('file:')
    expect(url.pathname).toMatch(/player\/local-video-player\.html$/)
    expect(url.searchParams.get('src')).toBe(`local://yt-stream/${ID}/video`)
    expect(url.searchParams.get('audioSrc')).toBe(`local://yt-stream/${ID}/audio`)
    expect(url.searchParams.get('subtitle')).toBe(`local://yt-cache/${ID}.vtt`)
    expect(url.searchParams.get('title')).toBe('Hino')
    expect(player.play).toHaveBeenCalledWith(ID)
  })

  it('arquivo do cache: só a imagem com som, sem legenda nem título vazios', async () => {
    const player = { play: vi.fn(async () => ({ kind: 'cache', src: `local://yt-cache/${ID}.mp4`, subtitle: null, title: '' })), release: vi.fn() }
    const url = new URL(await resolveOnlineVideoPlayerUrl(ID, player))
    expect(url.searchParams.get('src')).toBe(`local://yt-cache/${ID}.mp4`)
    expect([...url.searchParams.keys()]).toEqual(['src'])
  })

  it('sem vídeo do YouTube, recurso desligado ou falha: segue com a página do YouTube', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await resolveOnlineVideoPlayerUrl(null, { play: vi.fn(), release: vi.fn() })).toBeNull()
      expect(await resolveOnlineVideoPlayerUrl(ID, null)).toBeNull()
      expect(await resolveOnlineVideoPlayerUrl(ID, { play: vi.fn(async () => null), release: vi.fn() })).toBeNull()
      const failing = { play: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'blocked' }) }), release: vi.fn() }
      expect(await resolveOnlineVideoPlayerUrl(ID, failing)).toBeNull()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cópia local'), 'blocked')
      await resolveOnlineVideoPlayerUrl(ID, { play: vi.fn(async () => { throw new Error('sem código') }), release: vi.fn() })
      expect(warn).toHaveBeenLastCalledWith(expect.any(String), 'sem código')
    } finally { warn.mockRestore() }
  })

  it('usa o player registrado pelo main por padrão', async () => {
    const player = { play: vi.fn(async () => null), release: vi.fn() }
    setOnlineVideoPlayer(player)
    await resolveOnlineVideoPlayerUrl(ID)
    expect(player.play).toHaveBeenCalledWith(ID)
    setOnlineVideoPlayer(null)
  })

  it('a janela de controle abre na hora; a fonte do YouTube entra depois; fechar libera o vídeo', () => {
    const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
    const open = source.slice(source.indexOf('export async function openWebProjectionWindows'))
    expect(open.slice(0, open.indexOf('createSourceWindow('))).not.toContain('await resolveOnlineVideoPlayerUrl')
    expect(open).toContain("createSourceWindow(waitsForCopy ? 'about:blank' : loadUrl, title)")
    expect(open.indexOf('startYoutubeSource(sourceWindow, youtubeId')).toBeGreaterThan(open.indexOf('createSourceWindow('))
    const close = source.slice(source.indexOf('export function closeWebProjectionWindows'), source.indexOf('export function closeWebProjectionWindows') + 300)
    expect(close).toContain('releaseCurrentOnlineVideo()')
  })

  it('janela de controle aparece sem esperar a página desenhar; o close atrasado da anterior não derruba a nova', () => {
    const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
    const create = source.slice(source.indexOf('function createSourceWindow('), source.indexOf('function createSiteSourceWindow('))
    expect(create).not.toContain("'ready-to-show'")
    expect(create.indexOf('win.show()')).toBeLessThan(create.indexOf('void win.loadURL(loadUrl)'))
    const site = source.slice(source.indexOf('function createSiteSourceWindow('), source.indexOf('function createSiteSourceWindow(') + 3000)
    for (const block of [create, site]) {
      const closed = block.slice(block.indexOf("win.on('closed'"))
      expect(closed.indexOf('if (sourceWindow && sourceWindow !== win) return')).toBeLessThan(closed.indexOf('detachControlBar()'))
    }
  })
})

describe('fonte do YouTube na janela já aberta', () => {
  const YT = `https://www.youtube.com/embed/${ID}?autoplay=1`
  const makeWin = () => ({ destroyed: false, isDestroyed() { return this.destroyed }, loadURL: vi.fn(async () => {}) })
  const copy = { kind: 'cache', src: `local://yt-cache/${ID}.mp4`, subtitle: null, title: '' }

  it('com cópia: carrega o player local e não observa o YouTube', async () => {
    const win = makeWin()
    const recover = vi.fn()
    const player = { play: vi.fn(async () => copy), release: vi.fn() }
    expect(await startYoutubeSource(win, ID, YT, { player, recover, isCurrent: () => true })).toBe('copy')
    expect(new URL(win.loadURL.mock.calls[0][0]).searchParams.get('src')).toBe(copy.src)
    expect(recover).not.toHaveBeenCalled()
    expect(getSourceMediaInfo().filePath).toBe('')

    const file = `/cache/${ID}.mp4`
    await startYoutubeSource(makeWin(), ID, YT, { player: { play: vi.fn(async () => ({ ...copy, file })), release: vi.fn() }, recover, isCurrent: () => true })
    expect(getSourceMediaInfo().filePath).toBe(file)
  })

  it('cópia com legenda na tela: as TVs seguem no espelho', async () => {
    const withCaptions = { ...copy, file: `/cache/${ID}.mp4`, subtitle: `local://yt-cache/${ID}.vtt` }
    const win = makeWin()
    await startYoutubeSource(win, ID, YT, { player: { play: vi.fn(async () => withCaptions), release: vi.fn() }, recover: vi.fn(), isCurrent: () => true })
    expect(new URL(win.loadURL.mock.calls[0][0]).searchParams.get('subtitle')).toBe(withCaptions.subtitle)
    expect(getSourceMediaInfo().filePath).toBe('')
  })

  it('o botão CC e a rota das TVs seguem a legenda da fonte', () => {
    const source = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
    expect(source).toContain('canControlCaptions: currentSourceHasCaptions,')
    expect(source).toContain('const captionsOnScreen = currentSourceHasCaptions && !currentSourceCaptionsHidden')
    expect(source).toContain('currentSourceHasCaptions = Boolean(currentSourceYoutubeId)')
  })

  it('sem cópia: carrega o player do YouTube e entrega à recuperação', async () => {
    const win = makeWin()
    const player = { play: vi.fn(async () => null), release: vi.fn() }
    const recover = vi.fn(async () => null)
    const isCurrent = () => true
    expect(await startYoutubeSource(win, ID, YT, { player, recover, isCurrent })).toBe('youtube')
    expect(win.loadURL).toHaveBeenCalledWith(YT)
    expect(recover).toHaveBeenCalledWith(win, ID, { player, isCurrent })
    recover.mockResolvedValueOnce('page')
    expect(await startYoutubeSource(makeWin(), ID, YT, { player, recover, isCurrent })).toBe('page')
  })

  it('janela já no YouTube (sem serviço de cópia): só observa', async () => {
    const win = makeWin()
    const recover = vi.fn(async () => 'copy')
    expect(await startYoutubeSource(win, ID, null, { player: null, recover, isCurrent: () => true })).toBe('copy')
    expect(win.loadURL).not.toHaveBeenCalled()
  })

  it('janela fechada enquanto localizava a cópia: libera e não carrega nada', async () => {
    const win = makeWin()
    const player = { play: vi.fn(async () => { win.destroyed = true; return copy }), release: vi.fn() }
    expect(await startYoutubeSource(win, CLOSED_ID, YT, { player, recover: vi.fn(), isCurrent: () => true })).toBeNull()
    expect(player.release).toHaveBeenCalledWith(CLOSED_ID)
    expect(win.loadURL).not.toHaveBeenCalled()

    const other = makeWin()
    const empty = { play: vi.fn(async () => null), release: vi.fn() }
    expect(await startYoutubeSource(other, CLOSED_ID, YT, { player: empty, recover: vi.fn(), isCurrent: () => false })).toBeNull()
    expect(empty.release).not.toHaveBeenCalled()
  })

  it('por padrão usa o player registrado, a janela atual e a recuperação padrão', async () => {
    const player = { play: vi.fn(async () => copy), release: vi.fn() }
    setOnlineVideoPlayer(player)
    try {
      expect(await startYoutubeSource(makeWin(), DEFAULT_ID, YT)).toBeNull()
      expect(player.release).toHaveBeenCalledWith(DEFAULT_ID)
    } finally { setOnlineVideoPlayer(null) }
  })
})

describe('sonda da página do YouTube', () => {
  function run(html, video) {
    const doc = {
      querySelector: (selector) => (selector === 'video' ? video : html),
    }
    return new Function('document', `return ${YOUTUBE_PLAYBACK_PROBE_SCRIPT}`)(doc)
  }

  it('tocando, com erro visível ou só com dados carregados', () => {
    expect(run(null, { paused: false, currentTime: 3, readyState: 4 })).toEqual({ playing: true, error: false, hasData: true })
    expect(run({ getClientRects: () => [{}] }, null)).toEqual({ playing: false, error: true, hasData: false })
    expect(run({ getClientRects: () => [] }, { paused: true, currentTime: 0, readyState: 2 })).toEqual({ playing: false, error: false, hasData: true })
    expect(run(null, { paused: false, currentTime: 0, readyState: 1 })).toEqual({ playing: false, error: false, hasData: false })
  })
})

describe('observação da página do YouTube', () => {
  function clock() {
    let t = 0
    return { now: () => t, sleep: vi.fn(async (ms) => { t += ms }) }
  }
  const base = (overrides) => ({ failedLoad: () => false, isClosed: () => false, timeoutMs: 3000, ...clock(), ...overrides })

  it('vídeo começou: não mexe na página', async () => {
    const probe = vi.fn().mockResolvedValueOnce({ hasData: true }).mockResolvedValueOnce({ playing: true })
    expect(await watchYoutubePlayback(base({ probe }))).toBe('playing')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('erro do player, falha de carga ou nada carregado no prazo: falhou', async () => {
    expect(await watchYoutubePlayback(base({ probe: async () => ({ error: true }) }))).toBe('failed')
    expect(await watchYoutubePlayback(base({ probe: vi.fn(), failedLoad: () => true }))).toBe('failed')
    expect(await watchYoutubePlayback(base({ probe: async () => { throw new Error('navegando') } }))).toBe('failed')
  })

  it('carregou mas ficou parado: não é falha', async () => {
    expect(await watchYoutubePlayback(base({ probe: async () => ({ hasData: true }) }))).toBe('idle')
  })

  it('janela fechada antes ou durante a sonda', async () => {
    expect(await watchYoutubePlayback(base({ probe: vi.fn(), isClosed: () => true }))).toBe('closed')
    let closed = false
    expect(await watchYoutubePlayback(base({ probe: async () => { closed = true; return null }, isClosed: () => closed }))).toBe('closed')
  })

  it('usa relógio e espera reais por padrão', async () => {
    vi.useFakeTimers()
    try {
      const probe = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ playing: true })
      const result = watchYoutubePlayback({ probe, failedLoad: () => false, isClosed: () => false })
      await vi.advanceTimersByTimeAsync(1000)
      expect(await result).toBe('playing')
    } finally { vi.useRealTimers() }
  })
})

describe('recuperação quando o player embutido do YouTube não toca', () => {
  const EMBED = `https://www.youtube.com/embed/${ID}?autoplay=1`
  function makeWin(url = EMBED) {
    const listeners = new Map()
    return {
      destroyed: false,
      isDestroyed() { return this.destroyed },
      loadURL: vi.fn(async () => {}),
      webContents: {
        executeJavaScript: vi.fn(async () => ({ playing: true })),
        getURL: vi.fn(() => url),
        on: vi.fn((event, fn) => listeners.set(event, fn)),
        removeListener: vi.fn((event) => listeners.delete(event)),
      },
      emit: (event, ...args) => listeners.get(event)?.({}, ...args),
      listeners,
    }
  }
  const source = { kind: 'stream', src: `local://yt-stream/${ID}/video`, audioSrc: null, subtitle: null, title: '' }

  it('não tocou: baixa a cópia e carrega o player local na mesma janela', async () => {
    const win = makeWin()
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => source) }
    const watch = vi.fn(async ({ probe }) => { await probe(); return 'failed' })
    expect(await fallbackWhenYoutubeFails(win, ID, { player, watch, isCurrent: () => true })).toBe('copy')
    expect(win.webContents.executeJavaScript).toHaveBeenCalledWith(YOUTUBE_PLAYBACK_PROBE_SCRIPT, true)
    expect(player.fallback).toHaveBeenCalledWith(ID)
    expect(player.play).not.toHaveBeenCalled()
    expect(new URL(win.loadURL.mock.calls[0][0]).searchParams.get('src')).toBe(source.src)
    expect(win.listeners.size).toBe(0)
    expect(getSourceMediaInfo().filePath).toBe('')
  })

  it('cópia que já estava pronta: as TVs recebem o arquivo dela', async () => {
    const cached = { kind: 'cache', src: `local://yt-cache/${ID}.mp4`, subtitle: null, title: '', file: `/cache/${ID}.mp4` }
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => cached) }
    expect(await fallbackWhenYoutubeFails(makeWin(), ID, { player, watch: async () => 'failed', isCurrent: () => true })).toBe('copy')
    expect(getSourceMediaInfo().filePath).toBe(cached.file)
  })

  it('tocando ou parado à espera do operador: não mexe na janela', async () => {
    const win = makeWin()
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn() }
    expect(await fallbackWhenYoutubeFails(win, ID, { player, watch: async () => 'playing', isCurrent: () => true })).toBeNull()
    expect(await fallbackWhenYoutubeFails(win, ID, { player, watch: async () => 'idle', isCurrent: () => true })).toBeNull()
    expect(player.fallback).not.toHaveBeenCalled()
    expect(win.loadURL).not.toHaveBeenCalled()
  })

  it('falha de carga da página principal conta; navegação abortada e subquadros não', async () => {
    const win = makeWin()
    const seen = []
    const watch = async ({ failedLoad }) => {
      win.emit('did-fail-load', -3, 'aborted', 'u', true); seen.push(failedLoad())
      win.emit('did-fail-load', -105, 'dns', 'u', false); seen.push(failedLoad())
      win.emit('did-fail-load', -106, 'offline', 'u', true); seen.push(failedLoad())
      return 'idle'
    }
    await fallbackWhenYoutubeFails(win, ID, { player: null, watch, isCurrent: () => true })
    expect(seen).toEqual([false, false, true])
  })

  it('sem cópia (Store, sistema sem ferramentas ou download falhou): abre a página do vídeo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const watch = async () => 'failed'
      for (const player of [null, { play: vi.fn(), release: vi.fn() }, { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => null) }]) {
        const win = makeWin()
        expect(await fallbackWhenYoutubeFails(win, ID, { player, watch, isCurrent: () => true })).toBe('page')
        expect(win.loadURL).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${ID}`)
      }
      const already = makeWin(`https://www.youtube.com/watch?v=${ID}`)
      expect(await fallbackWhenYoutubeFails(already, ID, { player: null, watch, isCurrent: () => true })).toBeNull()
      expect(already.loadURL).not.toHaveBeenCalled()
    } finally { warn.mockRestore() }
  })

  it('janela fechada durante o download: libera a cópia e não carrega nada', async () => {
    const closedWin = makeWin()
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => { closedWin.destroyed = true; return source }) }
    expect(await fallbackWhenYoutubeFails(closedWin, CLOSED_ID, { player, watch: async () => 'failed', isCurrent: () => true })).toBeNull()
    expect(player.release).toHaveBeenCalledWith(CLOSED_ID)
    expect(closedWin.loadURL).not.toHaveBeenCalled()
    expect(closedWin.webContents.removeListener).not.toHaveBeenCalled()

    const noCopy = makeWin()
    const empty = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => { noCopy.destroyed = true; return null }) }
    expect(await fallbackWhenYoutubeFails(noCopy, CLOSED_ID, { player: empty, watch: async () => 'failed', isCurrent: () => true })).toBeNull()
    expect(empty.release).not.toHaveBeenCalled()
  })

  it('outra projeção já usa o mesmo vídeo: não libera a cópia dela', async () => {
    const first = makeWin()
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => source) }
    await fallbackWhenYoutubeFails(first, ID, { player, watch: async () => 'failed', isCurrent: () => true })
    let current = true
    const second = makeWin()
    player.fallback.mockImplementationOnce(async () => { current = false; return source })
    expect(await fallbackWhenYoutubeFails(second, ID, { player, watch: async () => 'failed', isCurrent: () => current })).toBeNull()
    expect(player.release).not.toHaveBeenCalled()
  })

  it('por padrão usa o player registrado e a janela de projeção atual', async () => {
    const player = { play: vi.fn(), release: vi.fn(), fallback: vi.fn(async () => source) }
    setOnlineVideoPlayer(player)
    try {
      const win = makeWin()
      expect(await fallbackWhenYoutubeFails(win, DEFAULT_ID, { watch: async () => 'failed' })).toBeNull()
      expect(player.release).toHaveBeenCalledWith(DEFAULT_ID)
      const playing = makeWin()
      expect(await fallbackWhenYoutubeFails(playing, DEFAULT_ID, { isCurrent: () => true })).toBeNull()
    } finally { setOnlineVideoPlayer(null) }
  })
})

describe('origem da projeção do YouTube', () => {
  it('vídeo do YouTube abre o player embutido limpo; site abre a página; id inválido segue a página', () => {
    const embed = new URL(resolveSourceUrl({ videoId: ID }))
    expect(embed.origin + embed.pathname).toBe(`https://www.youtube.com/embed/${ID}`)
    expect(embed.searchParams.get('controls')).toBe('0')
    expect(resolveSourceUrl({ url: `https://youtu.be/${ID}` })).toBe(resolveSourceUrl({ videoId: ID }))
    expect(resolveSourceUrl({ mode: 'site', url: `https://www.youtube.com/watch?v=${ID}` })).toBe(`https://www.youtube.com/watch?v=${ID}`)
    expect(resolveSourceUrl({ videoId: 'curto' })).toBe('https://www.youtube.com/watch?v=curto')
  })
})
