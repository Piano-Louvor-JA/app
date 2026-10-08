// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  openLiturgyWebOnConfiguredScreens,
  playLiturgyWebOnConfiguredScreens,
  openLiturgyLocalImageControl,
  openLiturgyLocalPdfControl,
  playLiturgyLocalPdfOnScreens,
  openLiturgyLocalPresentationControl,
  playLiturgyLocalPresentationOnScreens,
  playLiturgyLocalVideoOnScreens,
  openLiturgyLocalVideoControl,
  _openLiturgyLocalVideo,
} from '../services/liturgy-web-projection'
import {
  publishLiturgyWebRuntime,
  readLiturgyWebRuntimeFromStorage,
} from '../services/liturgy-web-runtime'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'
import {
  listExtendedDisplays,
  listSystemDisplays,
} from '@modules/settings/services/display-service'
import { openProjectionModule } from '@shared/composables/useProjectionWindow'

/**
 * Kill plane 3 liturgy-web-projection — 12 survivors do round anterior:
 * #17 (trim assimétrico), #57/#185/#91 (flags), #115/#118 (title default em
 * openLocalVideoControl/OnScreens), #135 (equivalente: paths[0] sempre
 * existe), #137/#165/#199 (fallback de label p/ basename vazio), #206
 * (detectOffice SEM call -> referência truthy), #0 (sleep block — tempo).
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

describe('kill plane 3 — trims assimétricos e flags', () => {
  it('#17 title whitespace + url com espaços: label = url TRIMADA', async () => {
    setBridge(bridgeMock)
    await openLiturgyWebOnConfiguredScreens('  https://x.com/a  ', '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'https://x.com/a' }),
    )
  })

  it('#57 play youtube: retorna true de verdade (não false)', async () => {
    setBridge({ projection: { remotePlay: vi.fn(async () => true) } })
    const t0 = Date.now()
    const ok = await playLiturgyWebOnConfiguredScreens(
      'https://youtube.com/watch?v=abc',
      'T',
    )
    expect(ok).toBe(true)
    // #0 sleep: o caminho com remotePlay aguarda sleep(600) — mutante com
    // corpo vazio resolve na hora. Tolerância folgada p/ CI lento.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400)
  })

  it('#91 local video browser: publish active true (não false)', async () => {
    await _openLiturgyLocalVideo('/m/clip.mp4', 'T', true, 'blob:1')
    const pub = readLiturgyWebRuntimeFromStorage()
    expect(pub?.active).toBe(true)
    expect(pub?.title).toBe('T')
  })

  it('#115/#118 local video control/screens SEM title: label = filename', async () => {
    await openLiturgyLocalVideoControl('/m/clip.mp4', undefined, 'blob:1')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('clip.mp4')
    localStorage.clear()
    publishLiturgyWebRuntime({ active: false } as never)
    await playLiturgyLocalVideoOnScreens('/m/outro.mp4', undefined, 'blob:2')
    expect(readLiturgyWebRuntimeFromStorage()?.title).toBe('outro.mp4')
  })

  it('#185 playLiturgyLocalPdfOnScreens: retorno true de verdade', async () => {
    setBridge(bridgeMock)
    const ok = await playLiturgyLocalPdfOnScreens('/d/x.pdf', 'T', )
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'pdf', withScreens: true }),
    )
  })
})

describe('kill plane 3 — basenames vazios caem no fallback (#137/#165/#199)', () => {
  it('#137 imagens: basename vazio -> label "Imagens" (não "")', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalImageControl(['/', '/b.png'], '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Imagens' }),
    )
  })

  it('#165 pdf: basename vazio -> label "PDF" (não "")', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPdfControl('/', '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'PDF' }),
    )
  })

  it('#199 presentation: basename vazio -> label "Apresentação" (não "")', async () => {
    setBridge(bridgeMock)
    await openLiturgyLocalPresentationControl('/', '   ')
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Apresentação' }),
    )
  })
})

describe('kill plane 3 — detectOffice sem call (#206)', () => {
  it('#206 detectOffice=false + engine indefinido -> openUrl NÃO chamado (falha cedo)', async () => {
    setBridge({
      projection: { openUrl: vi.fn(async () => true) },
      presentation: { detectOffice: vi.fn(async () => false) },
    })
    const ok = await openLiturgyLocalPresentationControl('/d/x.pptx', 'T')
    expect(ok).toBe(false)
  })

  it('#206b detectOffice=false + engine powerpoint -> segue (openUrl chamado)', async () => {
    setBridge({
      projection: { openUrl: vi.fn(async () => true) },
      presentation: { detectOffice: vi.fn(async () => false) },
    })
    const ok = await openLiturgyLocalPresentationControl('/d/x.pptx', 'T', 'powerpoint')
    expect(ok).toBe(true)
  })

  it('#206c playScreens: detectOffice=true com engine auto -> openUrl mode presentation', async () => {
    setBridge(bridgeMock)
    const { playLiturgyLocalPresentationOnScreens } = await import(
      '../services/liturgy-web-projection'
    )
    const ok = await playLiturgyLocalPresentationOnScreens('/d/y.pptx', 'T')
    expect(ok).toBe(true)
    expect(bridgeMock.projection.openUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'presentation' }),
    )
  })
})
