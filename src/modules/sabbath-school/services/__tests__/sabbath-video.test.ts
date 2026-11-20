// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ bridge: null as unknown }))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => mocks.bridge),
}))

vi.mock('@shared/services/workspace-api', () => ({
  resolveMediaUrl: vi.fn((p: string) => `local://media/${p}`),
}))

import { pickAndImportSabbathVideo, probeVideoDurationMs } from '../sabbath-video'

const REL = 'modulos/escola-sabatina/video/video-1.mp4'
let probes: HTMLVideoElement[]

/** O `<video>` criado pela sonda; jsdom não carrega mídia, então o teste dispara os eventos. */
function lastProbe(): HTMLVideoElement {
  return probes[probes.length - 1]
}

function setDuration(video: HTMLVideoElement, seconds: number) {
  Object.defineProperty(video, 'duration', { configurable: true, get: () => seconds })
}

function loadMetadata(seconds: number) {
  const video = lastProbe()
  setDuration(video, seconds)
  video.dispatchEvent(new Event('loadedmetadata'))
}

beforeEach(() => {
  probes = []
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = create(tag)
    if (tag === 'video') probes.push(el as HTMLVideoElement)
    return el
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  mocks.bridge = null
})

describe('probeVideoDurationMs', () => {
  it('lê a duração do vídeo em ms, sem som, e solta o arquivo', async () => {
    const pending = probeVideoDurationMs('local://media/x.mp4')
    expect(lastProbe().muted).toBe(true)
    expect(lastProbe().getAttribute('src')).toBe('local://media/x.mp4')
    loadMetadata(90.4)
    await expect(pending).resolves.toBe(90_400)
    expect(lastProbe().hasAttribute('src')).toBe(false)
  })

  it('evento que chega depois da resposta é ignorado', async () => {
    const pending = probeVideoDurationMs('local://media/x.mp4')
    loadMetadata(5)
    lastProbe().dispatchEvent(new Event('error'))
    await expect(pending).resolves.toBe(5_000)
  })

  it('arquivo que o player não abre não tem duração', async () => {
    const pending = probeVideoDurationMs('local://media/x.mp4')
    lastProbe().dispatchEvent(new Event('error'))
    await expect(pending).resolves.toBeNull()
  })

  it('duração zero não é vídeo válido', async () => {
    const pending = probeVideoDurationMs('local://media/x.mp4')
    loadMetadata(0)
    await expect(pending).resolves.toBeNull()
  })

  it('webm sem duração no cabeçalho: busca o fim para descobrir', async () => {
    const pending = probeVideoDurationMs('local://media/x.webm')
    const video = lastProbe()
    loadMetadata(Infinity)
    expect(video.currentTime).toBeGreaterThan(1e6)
    setDuration(video, 12.25)
    video.dispatchEvent(new Event('durationchange'))
    await expect(pending).resolves.toBe(12_250)
  })

  it('desiste depois do tempo limite', async () => {
    vi.useFakeTimers()
    const pending = probeVideoDurationMs('local://media/x.mp4', 1_000)
    vi.advanceTimersByTime(1_000)
    await expect(pending).resolves.toBeNull()
  })
})

describe('pickAndImportSabbathVideo', () => {
  it('fora do app desktop não há como escolher arquivo', async () => {
    await expect(pickAndImportSabbathVideo()).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('cancelar o diálogo devolve o motivo do processo principal', async () => {
    mocks.bridge = { sabbathSchool: { importVideo: vi.fn(async () => ({ ok: false, reason: 'cancelled' })), clearVideo: vi.fn() } }
    await expect(pickAndImportSabbathVideo()).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('sem motivo informado vira erro', async () => {
    mocks.bridge = { sabbathSchool: { importVideo: vi.fn(async () => ({ ok: true })), clearVideo: vi.fn() } }
    await expect(pickAndImportSabbathVideo()).resolves.toEqual({ ok: false, reason: 'error' })
  })

  it('importa, lê a duração e devolve o vídeo com o nome original', async () => {
    mocks.bridge = {
      sabbathSchool: {
        importVideo: vi.fn(async () => ({ ok: true, fileName: 'video-1.mp4', relativePath: REL, originalName: 'Tema ES.mp4' })),
        clearVideo: vi.fn(),
      },
    }
    const pending = pickAndImportSabbathVideo()
    await vi.waitFor(() => expect(probes).toHaveLength(1))
    expect(lastProbe().getAttribute('src')).toBe(`local://media/${REL}`)
    loadMetadata(300)
    await expect(pending).resolves.toEqual({ ok: true, video: { relativePath: REL, name: 'Tema ES.mp4', durationMs: 300_000 } })
  })

  it('sem nome original usa o nome do arquivo copiado', async () => {
    mocks.bridge = { sabbathSchool: { importVideo: vi.fn(async () => ({ ok: true, fileName: 'video-1.mp4', relativePath: REL })), clearVideo: vi.fn() } }
    const pending = pickAndImportSabbathVideo()
    await vi.waitFor(() => expect(probes).toHaveLength(1))
    loadMetadata(10)
    await expect(pending).resolves.toMatchObject({ ok: true, video: { name: 'video-1.mp4' } })
  })

  it('sem nome nenhum fica com nome vazio', async () => {
    mocks.bridge = { sabbathSchool: { importVideo: vi.fn(async () => ({ ok: true, relativePath: REL })), clearVideo: vi.fn() } }
    const pending = pickAndImportSabbathVideo()
    await vi.waitFor(() => expect(probes).toHaveLength(1))
    loadMetadata(10)
    await expect(pending).resolves.toMatchObject({ ok: true, video: { name: '' } })
  })

  it('vídeo que não abre é apagado da pasta e recusado', async () => {
    const clearVideo = vi.fn(async () => ({ ok: true }))
    mocks.bridge = { sabbathSchool: { importVideo: vi.fn(async () => ({ ok: true, fileName: 'v.mp4', relativePath: REL })), clearVideo } }
    const pending = pickAndImportSabbathVideo()
    await vi.waitFor(() => expect(probes).toHaveLength(1))
    lastProbe().dispatchEvent(new Event('error'))
    await expect(pending).resolves.toEqual({ ok: false, reason: 'invalid_video' })
    expect(clearVideo).toHaveBeenCalledOnce()
  })
})
