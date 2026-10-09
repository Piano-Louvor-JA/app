// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de track-media.ts — coleta de mídias da faixa, semáforo de
 * checks offline, cache de download, download com progresso/abort/offline,
 * delete. Exports puros testados sem mock de rede.
 */

const isDesktopApp = vi.fn(() => false)
const getDesktopBridge = vi.fn(() => null)
vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => isDesktopApp(),
  getDesktopBridge: () => getDesktopBridge(),
}))

const readCatalogRecord = vi.fn()
const fetchRemoteCatalogJson = vi.fn()
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: (...a: unknown[]) => readCatalogRecord(...a),
}))
vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: (...a: unknown[]) => fetchRemoteCatalogJson(...a),
}))
vi.mock('@modules/media/services/custom-catalog', () => ({
  CUSTOM_MUSIC_ID_OFFSET: 1_000_000,
}))

import {
  peekTrackDownloadCache,
  toRelativeMediaPath,
  mediaTypeFromUrl,
  collectTrackMediaItems,
  invalidateTrackMediaCache,
  isTrackMediaDownloaded,
  downloadTrackMedia,
  deleteTrackMedia,
} from '../track-media'

beforeEach(() => {
  vi.clearAllMocks()
  isDesktopApp.mockReturnValue(false)
  getDesktopBridge.mockReturnValue(null)
  invalidateTrackMediaCache()
})

describe('toRelativeMediaPath', () => {
  it('URL absoluta, prefixos e trim', () => {
    expect(toRelativeMediaPath('https://api.com/file/images/pt/a.jpg')).toBe('pt/a.jpg')
    expect(toRelativeMediaPath('/musics/pt/1.mp3')).toBe('pt/1.mp3')
    expect(toRelativeMediaPath('covers/x.png')).toBe('x.png')
    expect(toRelativeMediaPath('Capas/Y.png')).toBe('Y.png')
    expect(toRelativeMediaPath('Musicas/z.mp3')).toBe('z.mp3')
    expect(toRelativeMediaPath('  ')).toBe('')
  })
})

describe('mediaTypeFromUrl', () => {
  it('infere music/covers/slides de vários formatos', () => {
    expect(mediaTypeFromUrl('/musics/1.mp3')).toBe('music')
    expect(mediaTypeFromUrl('musicas/1.mp3')).toBe('music')
    expect(mediaTypeFromUrl('https://x.com/file/covers/c.png')).toBe('covers')
    expect(mediaTypeFromUrl('/capas/c.png')).toBe('covers')
    expect(mediaTypeFromUrl('/images/pt/s.jpg')).toBe('slides')
    expect(mediaTypeFromUrl('aleatório')).toBe('slides')
  })
})

describe('collectTrackMediaItems', () => {
  it('coleta áudio, instrumental, capa, letras e álbuns; dedupe por tipo:path', async () => {
    readCatalogRecord.mockResolvedValue({
      url_music: '/musics/pt/1.mp3',
      url_instrumental_music: '/musics/pt/1-i.mp3',
      url_image: '/images/pt/capa.jpg',
      lyric: [
        { url_image: '/images/pt/s1.jpg' },
        { url_image: '   ' }, // vazio filtrado
        { url_image: '/images/pt/capa.jpg' }, // dedupe com capa? tipos iguais (slides vs slides)
        { url_image: '/covers/pt/capa.jpg' },
      ],
      albums: [{ url_image: '/covers/pt/album.jpg' }, { url_image: null }],
    })
    const items = await collectTrackMediaItems(1)
    expect(items).toHaveLength(6)
    expect(items[0]).toMatchObject({ type: 'music', url: '/musics/pt/1.mp3' })
    expect(items[2]).toMatchObject({ type: 'slides' })
    expect(items.some((i: { type: string; url: string }) => i.type === 'covers' && i.url.includes('capa.jpg'))).toBe(true)
  })

  it('lyric como objeto (map); sem lyric; custom id -> []', async () => {
    readCatalogRecord.mockResolvedValue({
      url_music: '/musics/pt/2.mp3',
      lyric: { a: { url_image: '/images/a.png' }, b: { url_image: '/images/b.png' } },
    })
    expect(await collectTrackMediaItems(2)).toHaveLength(3)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/3.mp3' })
    expect(await collectTrackMediaItems(3)).toHaveLength(1)
    // custom (>= 1M): nem consulta catálogo
    expect(await collectTrackMediaItems(1_000_005)).toEqual([])
    expect(readCatalogRecord).not.toHaveBeenCalledWith('music_1000005')
  })

  it('sem registro local nem remoto -> []', async () => {
    readCatalogRecord.mockResolvedValue(null)
    fetchRemoteCatalogJson.mockRejectedValue(new Error('off'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await collectTrackMediaItems(9)).toEqual([])
    vi.restoreAllMocks()
  })
})

describe('cache e isTrackMediaDownloaded', () => {
  it('peek sem entrada -> undefined; true/false após cache', async () => {
    expect(peekTrackDownloadCache(1)).toBeUndefined()
    isDesktopApp.mockReturnValue(true)
    const check = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({ media: { check } } as never)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    expect(await isTrackMediaDownloaded(1)).toBe(true)
    expect(peekTrackDownloadCache(1)).toBe(true)
    invalidateTrackMediaCache(1)
    expect(peekTrackDownloadCache(1)).toBeUndefined()
  })

  it('web -> false; sem bridge -> false; sem itens -> false cacheado', async () => {
    expect(await isTrackMediaDownloaded(1)).toBe(false)
    isDesktopApp.mockReturnValue(true)
    expect(await isTrackMediaDownloaded(1)).toBe(false) // sem bridge: não cacheia
    expect(peekTrackDownloadCache(1)).toBeUndefined()
    getDesktopBridge.mockReturnValue({ media: { check: vi.fn() } } as never)
    readCatalogRecord.mockResolvedValue(null)
    expect(await isTrackMediaDownloaded(1)).toBe(false) // sem itens: cacheia false
    expect(peekTrackDownloadCache(1)).toBe(false)
  })

  it('item faltando -> false cacheado; invalidate total limpa', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({
      url_music: '/musics/pt/1.mp3',
      url_image: '/images/pt/x.jpg',
    })
    const check = vi.fn().mockImplementation(async (kind: string) => kind === 'music')
    getDesktopBridge.mockReturnValue({ media: { check } } as never)
    expect(await isTrackMediaDownloaded(1)).toBe(false) // slides faltando
    expect(peekTrackDownloadCache(1)).toBe(false)
    invalidateTrackMediaCache()
    expect(peekTrackDownloadCache(1)).toBeUndefined()
  })
})

describe('downloadTrackMedia', () => {
  it('web ou sem bridge -> unavailable', async () => {
    expect(await downloadTrackMedia(1)).toEqual({ status: 'error', reason: 'unavailable' })
    isDesktopApp.mockReturnValue(true)
    expect(await downloadTrackMedia(1)).toEqual({ status: 'error', reason: 'unavailable' })
  })

  it('sem itens -> idle/empty; abort antes do 1o -> cancelled', async () => {
    isDesktopApp.mockReturnValue(true)
    getDesktopBridge.mockReturnValue({ media: { check: vi.fn(), download: vi.fn() } } as never)
    readCatalogRecord.mockResolvedValue(null)
    expect(await downloadTrackMedia(1)).toEqual({ status: 'idle', reason: 'empty' })
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    expect(
      await downloadTrackMedia(1, { shouldAbort: () => true }),
    ).toEqual({ status: 'idle', reason: 'cancelled' })
  })

  it('offline -> error/offline; tudo existe -> downloaded com progresso 100', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    getDesktopBridge.mockReturnValue({ media: { check: vi.fn(), download: vi.fn() } } as never)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(await downloadTrackMedia(1)).toEqual({ status: 'error', reason: 'offline' })
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    const progress: number[] = []
    const check = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({ media: { check, download: vi.fn() } })
    const r = await downloadTrackMedia(1, { onProgress: (p: number) => progress.push(p) })
    expect(r).toEqual({ status: 'downloaded' })
    expect(progress).toEqual([100])
    expect(peekTrackDownloadCache(1)).toBe(true)
  })


  it('abort exato após o check (2a chamada de shouldAbort)', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    let n = 0
    const abortNaSegunda = () => ++n >= 2
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download: vi.fn() },
    } as never)
    expect(await downloadTrackMedia(1, { shouldAbort: abortNaSegunda })).toEqual({
      status: 'idle',
      reason: 'cancelled',
    })
  })

  it('download falho -> error/server; abort pós-check -> cancelled', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const check = vi.fn().mockResolvedValue(false)
    const download = vi.fn().mockResolvedValue(false)
    getDesktopBridge.mockReturnValue({ media: { check, download } } as never)
    expect(await downloadTrackMedia(1)).toEqual({ status: 'error', reason: 'server' })
    expect(warn).toHaveBeenCalled()
    expect(download).toHaveBeenCalled()
    warn.mockRestore()

    // abort após o check: shouldAbort alterna false->true
    let calls = 0
    const abortLater = () => {
      calls += 1
      return calls > 2
    }
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download: vi.fn().mockResolvedValue(true) },
    })
    expect(await downloadTrackMedia(1, { shouldAbort: abortLater })).toEqual({
      status: 'idle',
      reason: 'cancelled',
    })
  })
})


  it('cache hit true na 2a chamada; url absoluta e paths sem barra no download', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({
      url_music: 'https://files.example/musics/pt/9.mp3', // absoluta
    })
    const check = vi.fn()
      .mockResolvedValueOnce(false) // 1a: não existe -> baixa
      .mockResolvedValue(true) // 2a: existe -> cache true
    const download = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({ media: { check, download } } as never)
    expect(await isTrackMediaDownloaded(9)).toBe(false) // ainda não baixada
    invalidateTrackMediaCache(9)
    // download explícito cacheia true
    expect(await downloadTrackMedia(9)).toEqual({ status: 'downloaded' })
    expect(await isTrackMediaDownloaded(9)).toBe(true) // cache hit
    expect(check).toHaveBeenCalledTimes(2) // 1 na isTrack + 1 no download
  })


  it('download de url absoluta passa pelo resolve intacto', async () => {
    isDesktopApp.mockReturnValue(true)
    invalidateTrackMediaCache(40)
    readCatalogRecord.mockResolvedValue({
      url_music: 'https://files.example/musics/pt/40.mp3',
    })
    const download = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download },
    } as never)
    expect(await downloadTrackMedia(40)).toEqual({ status: 'downloaded' })
    expect(download).toHaveBeenCalledWith(
      'https://files.example/musics/pt/40.mp3',
      'music',
      'pt/40.mp3',
    )
  })


  it('download de path relativo sem barra inicial (L220/221)', async () => {
    isDesktopApp.mockReturnValue(true)
    invalidateTrackMediaCache(41)
    readCatalogRecord.mockResolvedValue({ url_music: 'musics/pt/41.mp3' })
    const download = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download },
    } as never)
    expect(await downloadTrackMedia(41)).toEqual({ status: 'downloaded' })
    expect(download).toHaveBeenCalledWith(
      expect.stringContaining('musics/pt/41.mp3'),
      'music',
      'pt/41.mp3',
    )
  })


  it('resolveRemoteFileUrl respeita VITE_URL_FILES definido', async () => {
    vi.stubEnv('VITE_URL_FILES', 'https://custom-files.example')
    // e o fallback (env ausente):
    isDesktopApp.mockReturnValue(true)
    invalidateTrackMediaCache(42)
    readCatalogRecord.mockResolvedValue({ url_music: 'musics/pt/42.mp3' })
    const download = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download },
    } as never)
    await downloadTrackMedia(42)
    expect(download).toHaveBeenCalledWith(
      'https://custom-files.example/musics/pt/42.mp3',
      'music',
      'pt/42.mp3',
    )
    vi.unstubAllEnvs()
  })


  it('resolveRemoteFileUrl fallback quando VITE_URL_FILES ausente', async () => {
    vi.stubEnv('VITE_URL_FILES', undefined as never)
    isDesktopApp.mockReturnValue(true)
    invalidateTrackMediaCache(43)
    readCatalogRecord.mockResolvedValue({ url_music: 'musics/pt/43.mp3' })
    const download = vi.fn().mockResolvedValue(true)
    getDesktopBridge.mockReturnValue({
      media: { check: vi.fn().mockResolvedValue(false), download },
    } as never)
    await downloadTrackMedia(43)
    expect(download).toHaveBeenCalledWith(
      'https://api.pianolouvorja.com.br/file/musics/pt/43.mp3',
      'music',
      'pt/43.mp3',
    )
    vi.unstubAllEnvs()
  })

  it('pushUnique descarta path que normaliza pra vazio', async () => {
    readCatalogRecord.mockResolvedValue({
      url_music: '/musics/', // vira '' depois do strip
      url_image: '/images/ok.png',
    })
    const items = await collectTrackMediaItems(30)
    expect(items).toHaveLength(1)
    expect(items[0]?.url).toBe('/images/ok.png')
  })

describe('deleteTrackMedia', () => {
  it('web/sem bridge: no-op; desktop deleta tudo e cacheia false', async () => {
    await deleteTrackMedia(1) // web: no-op
    isDesktopApp.mockReturnValue(true)
    await deleteTrackMedia(1) // sem bridge: no-op
    readCatalogRecord.mockResolvedValue({
      url_music: '/musics/pt/1.mp3',
      url_image: '/images/pt/x.jpg',
    })
    const del = vi.fn().mockResolvedValue(undefined)
    getDesktopBridge.mockReturnValue({ media: { delete: del, check: vi.fn() } })
    await deleteTrackMedia(1)
    expect(del).toHaveBeenCalledTimes(2)
    expect(peekTrackDownloadCache(1)).toBe(false)
  })
})

describe('semáforo de checks paralelos', () => {
  it('limita a 2 checks simultâneos (com waiters)', async () => {
    isDesktopApp.mockReturnValue(true)
    readCatalogRecord.mockResolvedValue({ url_music: '/musics/pt/1.mp3' })
    let active = 0
    let maxActive = 0
    const check = vi.fn().mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return true
    })
    getDesktopBridge.mockReturnValue({ media: { check } } as never)
    // 1 item por faixa -> 3 faixas em paralelo: máx 2 checks simultâneos
    await Promise.all([
      isTrackMediaDownloaded(11),
      isTrackMediaDownloaded(12),
      isTrackMediaDownloaded(13),
    ])
    expect(maxActive).toBeLessThanOrEqual(2)
  })
})
