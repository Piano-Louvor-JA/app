// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  _openLiturgyLocalVideo,
  openLiturgyWebOnConfiguredScreens,
  playLiturgyWebOnConfiguredScreens,
  openLiturgySiteControl,
  openLiturgyVideoControl,
  openLiturgySiteOnScreens,
  openLiturgyLocalImageControl,
  playLiturgyLocalImageOnScreens,
  openLiturgyLocalPdfControl,
  playLiturgyLocalPdfOnScreens,
  openLiturgyLocalPresentationControl,
  playLiturgyLocalPresentationOnScreens,
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
 * Kill plane 2 liturgy-web-projection — 31 survivors (round 6):
 * StringLiteral title='' default em todos os wrappers, trim MethodExpression,
 * BooleanLiteral flags, console.log, OptionalChaining parciais, active flag.
 * SEM vi.mock do módulo alvo (Stryker precisa injetar no runtime).
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

describe('StringLiteral title="" default em TODOS os wrappers', () => {
  const YT = 'https://youtube.com/watch?v=abc'

  it('#40 openLiturgySiteControl sem title: label = url (#40)', async () => {
    setBridge(null)
    await openLiturgySiteControl(YT)
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe(YT)
  })

  it('#43 openLiturgyVideoControl sem title: label = url (#43)', async () => {
    setBridge(null)
    await openLiturgyVideoControl(YT)
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe(YT)
  })

  it('#46 openLiturgySiteOnScreens sem title: label = url (#46)', async () => {
    setBridge(bridgeMock)
    await openLiturgySiteOnScreens(YT)
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: YT }),
    )
  })

  it('#71 playLiturgyWebOnConfiguredScreens sem title: label = url (#71)', async () => {
    setBridge(null)
    await playLiturgyWebOnConfiguredScreens(YT)
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe(YT)
  })

  it('#116/#119 local video control/screens sem title: label = filename (#116/#119)', async () => {
    setBridge(null)
    await _openLiturgyLocalVideo('/m/clip.mp4', undefined as never, true, 'blob:1')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('clip.mp4')
  })

  it('#147 openLiturgyLocalImageControl sem title: label = filename (#147)', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalImageControl(['/f/foto.jpg'])
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'foto.jpg' }),
    )
  })

  it('#150 playLiturgyLocalImageOnScreens sem title: label = filename (#150)', async () => {
    setBridge(bridgeMock)
    await playLiturgyLocalImageOnScreens(['/f/fig.png'])
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'fig.png' }),
    )
  })

  it('#181/#234 pdf control/screens sem title: label = filename (#181/#234)', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPdfControl('/d/x.pdf')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'x.pdf' }),
    )
    await playLiturgyLocalPdfOnScreens('/d/y.pdf')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'y.pdf' }),
    )
  })

  it('#237 presentation control/screens sem title: label = filename (#237)', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPresentationControl('/d/a.pptx')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'a.pptx' }),
    )
    await playLiturgyLocalPresentationOnScreens('/d/b.pptx')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'b.pptx' }),
    )
  })
})

describe('trim de paths e labels (#17/#136/#138/#154/#166/#188/#198/#200)', () => {
  it('#17 web: title e url com espaços -> ambos trimados', async () => {
    setBridge(bridgeMock)
    await openLiturgyWebOnConfiguredScreens('  https://x.com  ', '  T  ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'T', url: 'https://x.com' }),
    )
  })

  it('#136/#138 imagens: paths com espaços trimados; label do 1º filename', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalImageControl(['  /f/A.png  ', '   '], '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePaths: ['/f/A.png'], title: 'A.png' }),
    )
  })

  it('#154/#166 pdf: path com espaços trimado; label do filename', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPdfControl('  /d/Meu PDF.pdf  ', '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePath: '/d/Meu PDF.pdf', title: 'Meu PDF.pdf' }),
    )
  })

  it('#188/#198/#200 presentation: path trimado; label filename; title vazio', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPresentationControl('  /d/A B.pptx  ', '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePath: '/d/A B.pptx', title: 'A B.pptx' }),
    )
  })

  it('#154 video local desktop: path com espaços trimado no openUrl', async () => {
    setBridge(bridgeMock)
    const ok = await _openLiturgyLocalVideo('  /m/V.mp4  ', '  T  ', true)
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePath: '/m/V.mp4' }),
    )
  })
})

describe('flags booleanas e console (#57/#62/#92/#186)', () => {
  it('#57 openLiturgyWebOnConfiguredScreens retorna true de verdade', async () => {
    setBridge(bridgeMock)
    const ok = await openLiturgyWebOnConfiguredScreens('https://x.com', 'T')
    expect(ok).toBe(true)
  })

  it('#62 NÃO loga "BEFORE BRIDGE" (console limpo)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    setBridge({ projection: { remotePlay: vi.fn(async () => true) } })
    await playLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', 'T')
    expect(spy).not.toHaveBeenCalledWith('BEFORE BRIDGE')
    spy.mockRestore()
  })

  it('#92 publish active true de verdade (não false)', async () => {
    setBridge(null)
    await openLiturgyWebOnConfiguredScreens('https://x.com', 'T')
    expect(readLiturgyWebRuntimeFromStorage()?.active).toBe(true)
  })

  it('#186 playLiturgyLocalPdfOnScreens retorna true de verdade', async () => {
    setBridge(bridgeMock)
    const ok = await playLiturgyLocalPdfOnScreens('/d/x.pdf', 'T')
    expect(ok).toBe(true)
  })
})

describe('OptionalChaining parciais (#66/#67/#142/#170/#204/#207/#136)', () => {
  it('#66/#67 play: bridge SEM projection (undefined) -> retorna opened sem crash', async () => {
    setBridge({})
    const ok = await playLiturgyWebOnConfiguredScreens('https://youtube.com/watch?v=abc', 'T')
    expect(ok).toBe(true)
  })

  it('#142 imagens: bridge SEM projection -> false sem crash', async () => {
    setBridge({})
    const ok = await openLiturgyLocalImageControl(['/a.png'])
    expect(ok).toBe(false)
  })

  it('#170 pdf: bridge SEM projection -> false sem crash', async () => {
    setBridge({})
    const ok = await openLiturgyLocalPdfControl('/d/x.pdf')
    expect(ok).toBe(false)
  })

  it('#204 presentation: bridge SEM projection -> false sem crash', async () => {
    setBridge({})
    const ok = await openLiturgyLocalPresentationControl('/d/x.pptx')
    expect(ok).toBe(false)
  })

  it('#207 presentation: bridge COM projection SEM detectOffice -> segue sem crash', async () => {
    setBridge({ projection: { openUrl: vi.fn(async () => true) } })
    const ok = await openLiturgyLocalPresentationControl('/d/x.pptx', 'T')
    expect(ok).toBe(true)
  })

  it('#136 imagens: paths[0] presente -> label filename (sem optional crash)', async () => {
    setBridge(bridgeMock)
    const ok = await openLiturgyLocalImageControl(['/z/ok.png'], '   ')
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'ok.png' }),
    )
  })
})
