// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  _openLiturgyLocalVideo,
  openLiturgyWebOnConfiguredScreens,
  playLiturgyWebOnConfiguredScreens,
  openLiturgySiteControl,
  openLiturgyLocalImageControl,
  openLiturgyLocalPdfControl,
} from '../services/liturgy-web-projection'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import {
  publishLiturgyWebRuntime,
  readLiturgyWebRuntimeFromStorage,
} from '../services/liturgy-web-runtime'
import {
  closeProjectionModule,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'
import {
  listExtendedDisplays,
  listSystemDisplays,
} from '@modules/settings/services/display-service'

/**
 * Kill plane liturgy-web-projection — mutantes de label/trim/default args
 * (survivors Stryker round 5). SEM vi.mock: usa vi.spyOn em runtime para que
 * a injeção de mutantes do Stryker funcione (vi.mock module-level impede).
 */

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: vi.fn(() => ({ targetDisplayIds: [2] })),
}))

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: vi.fn(async () => [
    { id: 1, label: 'primary' },
    { id: 2, label: 'ext' },
  ]),
  listExtendedDisplays: vi.fn((displays: Array<{ id: number }>) =>
    displays.filter((d) => d.id === 2),
  ),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
  openProjectionModule: vi.fn(async () => true),
}))

vi.mock('../../settings/services/palco-session', () => ({
  palcoSession: {
    getState: () => ({ monitors: [] }),
    videoRouted: vi.fn(async () => true),
    projectRouted: vi.fn(async () => true),
    imageRouted: vi.fn(async () => true),
  },
}))

const bridgeMock = {
  projection: {
    openUrl: vi.fn(async () => true),
    remotePlay: vi.fn(async () => true),
  },
  presentation: {
    detectOffice: vi.fn(async () => true),
  },
}

function setBridge(value: unknown) {
  ;(window as unknown as { louvorja: unknown }).louvorja = value
}

beforeEach(() => {
  vi.clearAllMocks()
  setBridge(null)
  vi.mocked(loadProjectionSettings).mockReturnValue({ targetDisplayIds: [2] } as never)
  vi.mocked(openProjectionModule).mockResolvedValue(true)
  localStorage.clear()
  publishLiturgyWebRuntime({ active: false } as never)
})

describe('labels e defaults (#16/#17/#37-46/#79/#135-138/#147/#154/#164-166/#188/#198/#200)', () => {
  it('label = title.trim() quando title tem conteúdo (#16/#17)', async () => {
    await openLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', '  Meu Vídeo  ')
    const pub = readLiturgyWebRuntimeFromStorage()
    expect(pub?.title).toBe('Meu Vídeo')
  })

  it('title whitespace-only cai no rawUrl (#16)', async () => {
    await openLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', '   ')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('https://youtube.com/watch?v=abc')
  })

  it('default title="" não vira "Stryker was here!" (#37-46 chamando sem title)', async () => {
    await openLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('https://youtube.com/watch?v=abc')
  })

  it('video local: label cai no filename do path (#79/#147/#154) — browser com objectUrl publica runtime', async () => {
    const ok2 = await _openLiturgyLocalVideo('/media/Vídeo Teste.mp4', '   ', true, 'blob:x')
    expect(ok2).toBe(true)
    const pub = readLiturgyWebRuntimeFromStorage()
    expect(pub?.title).toBe('Vídeo Teste.mp4')
  })

  it('video local com title: label é o title trimado', async () => {
    await _openLiturgyLocalVideo('/media/v.mp4', '  Título  ', true, 'blob:x')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('Título')
  })

  it('videoId vazio para local video (#94)', async () => {
    await _openLiturgyLocalVideo('/media/v.mp4', '', true, 'blob:x')
    expect(readLiturgyWebRuntimeFromStorage()?.videoId).toBe('')
  })
})

describe('optional chaining e flags (#26/#66/#67/#92/#142/#149)', () => {
  it('bridge SEM projection.openUrl publica runtime (#26/#142)', async () => {
    setBridge({})
    const ok = await openLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', 'T')
    expect(ok).toBe(true)
    expect(readLiturgyWebRuntimeFromStorage()?.active).toBe(true)
    expect(vi.mocked(openProjectionModule)).toHaveBeenCalledWith('liturgy-web')
  })

  it('play: bridge sem remotePlay retorna opened sem crash (#66/#67)', async () => {
    setBridge({ projection: {} })
    const ok = await playLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', 'T')
    expect(ok).toBe(true)
  })

  it('site control com withScreens false repassa flag (#92 via openUrl payload)', async () => {
    setBridge(bridgeMock)
    await openLiturgySiteControl('https://x.com', 'T')
    expect(bridgeMock.projection.openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ withScreens: false }),
    )
  })

  it('imagens: com bridge, openUrl chamado com mode image e title trimado (#92/#135-138)', async () => {
    setBridge(bridgeMock)
    const ok = await openLiturgyLocalImageControl(['/a.png', '/b.png'], '  Galeria  ')
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'image', title: 'Galeria', withScreens: false }),
    )
  })

  it('imagens sem title: label do primeiro arquivo; sem bridge -> false (#135-138)', async () => {
    const ok = await openLiturgyLocalImageControl(['/fotos/xx.png'], '   ')
    expect(ok).toBe(false) // browser (sem bridge): caminho de images não publica runtime
    setBridge(bridgeMock)
    const ok2 = await openLiturgyLocalImageControl(['/fotos/xx.png'], '   ')
    expect(ok2).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'xx.png' }),
    )
  })

  it('pdf: label do arquivo com bridge (#147/#164/#166)', async () => {
    setBridge(bridgeMock)
    const ok = await openLiturgyLocalPdfControl('/docs/slides.pdf', '   ')
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'slides.pdf' }),
    )
  })
})
