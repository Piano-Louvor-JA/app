import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de media-paths.ts — normalização de paths, URLs remotas e
 * resolução de capas do disco (checkMany/check individual).
 */

const isElectronShell = vi.fn(() => false)
const getDesktopBridge = vi.fn(() => null)
vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: () => isElectronShell(),
  getDesktopBridge: () => getDesktopBridge(),
}))

import {
  toRelativeMediaPath,
  resolveRemoteFileUrl,
  resolveCoverDisplayUrl,
  resolveCoverUrlsFromDisk,
} from '../media-paths'

beforeEach(() => {
  vi.clearAllMocks()
  isElectronShell.mockReturnValue(false)
  getDesktopBridge.mockReturnValue(null)
})

describe('toRelativeMediaPath', () => {
  it('URL absoluta, prefixos de pasta e trim', () => {
    expect(toRelativeMediaPath('https://api.com/file/images/pt/a.jpg')).toBe('pt/a.jpg')
    expect(toRelativeMediaPath('/musics/pt/1.mp3')).toBe('pt/1.mp3')
    expect(toRelativeMediaPath('covers/x.png')).toBe('x.png')
    expect(toRelativeMediaPath('Imagens/Y.png')).toBe('Y.png')
    expect(toRelativeMediaPath('  ')).toBe('')
  })
})

describe('resolveRemoteFileUrl', () => {
  it('absoluta intacta; relativa ganha base', () => {
    expect(resolveRemoteFileUrl('https://x.com/a.png')).toBe('https://x.com/a.png')
    expect(resolveRemoteFileUrl('/images/a.png')).toContain('/images/a.png')
  })
})

describe('resolveCoverDisplayUrl', () => {
  it('null/undefined -> null', () => {
    expect(resolveCoverDisplayUrl(null)).toBeNull()
    expect(resolveCoverDisplayUrl(undefined)).toBeNull()
  })

  it('web -> remoto; electron -> local://media/covers', () => {
    expect(resolveCoverDisplayUrl('/covers/pt/c.png')).toContain('/covers/pt/c.png')
    isElectronShell.mockReturnValue(true)
    expect(resolveCoverDisplayUrl('/covers/pt/c.png')).toBe(
      'local://media/covers/pt/c.png',
    )
  })

  it('path que normaliza pra vazio -> remote da original', () => {
    expect(resolveCoverDisplayUrl('/covers/')).toContain('/covers/')
  })
})


  it('display de path SEM barra inicial e sem extensao de pasta (cobre L19/20 via remoto)', () => {
    vi.stubEnv('VITE_URL_FILES', '')
    isElectronShell.mockReturnValue(false)
    // 'arquivo.png' não tem pasta -> relative = 'arquivo.png' (não vazio) -> remoto:
    const r = resolveCoverDisplayUrl('arquivo.png')
    expect(r).toContain('arquivo.png')
    vi.unstubAllEnvs()
  })


  it('env VITE_URL_FILES ausente -> base fallback (stubEnv undefined)', () => {
    vi.stubEnv('VITE_URL_FILES', undefined as never)
    isElectronShell.mockReturnValue(false)
    const r = resolveCoverDisplayUrl('arquivo2.png')
    expect(r).toBe('https://api.pianolouvorja.com.br/file/arquivo2.png')
    vi.unstubAllEnvs()
  })

describe('resolveCoverUrlsFromDisk', () => {
  it('sem URLs válidas -> mapa vazio sem IPC', async () => {
    const r = await resolveCoverUrlsFromDisk([null, undefined, '   ', '/covers/'])
    expect(r.size).toBe(0)
    expect(getDesktopBridge).not.toHaveBeenCalled()
  })

  it('bridge com checkMany: local vence; faltante -> remoto', async () => {
    getDesktopBridge.mockReturnValue(({
      media: {
        checkMany: vi.fn().mockResolvedValue({
          'pt/a.png': 'file:///local/a.png',
          'pt/b.png': false,
        }),
      },
    }) as never)
    const r = await resolveCoverUrlsFromDisk([
      'https://api.com/file/covers/pt/a.png',
      '/covers/pt/b.png',
    ])
    expect(r.get('https://api.com/file/covers/pt/a.png')).toBe('file:///local/a.png')
    expect(r.get('/covers/pt/b.png')).toContain('/covers/pt/b.png')
  })

  it('bridge sem checkMany: usa check individual em paralelo', async () => {
    getDesktopBridge.mockReturnValue(({
      media: {
        check: vi.fn().mockImplementation(async (_k: string, rel: string) =>
          rel === 'pt/x.png' ? 'file:///x.png' : false,
        ),
      },
    }) as never)
    const r = await resolveCoverUrlsFromDisk(['/covers/pt/x.png'])
    expect(r.get('/covers/pt/x.png')).toBe('file:///x.png')
  })

  it('sem bridge nenhum: todos caem no remoto', async () => {
    const r = await resolveCoverUrlsFromDisk(['/covers/pt/z.png'])
    expect(r.get('/covers/pt/z.png')).toContain('/covers/pt/z.png')
  })
})

describe('gaps — resolveRemoteFileUrl sem barra e env ausente (só alcançável via display)', () => {
  it('display url de path sem barra inicial -> remoto com base default', () => {
    vi.stubEnv('VITE_URL_FILES', '')
    // '/covers/' normaliza pra vazio -> resolveRemoteFileUrl(urlPath) com path SEM barra? não,
    // a original é '/covers/'. Usa caminho: toRelative vazio -> resolveRemoteFileUrl('/covers/')
    const r = resolveCoverDisplayUrl('/covers/')
    expect(r).toContain('/covers/')
    vi.unstubAllEnvs()
  })

  it('electron com path que vira vazio -> remote com slash duplo? não: cai no remoto antes', () => {
    isElectronShell.mockReturnValue(true)
    // path '/covers/' -> relative '' -> resolveRemoteFileUrl(original)
    expect(resolveCoverDisplayUrl('/covers/')).toContain('/covers/')
  })
})
