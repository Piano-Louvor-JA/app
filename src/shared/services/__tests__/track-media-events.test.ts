// track-media: mutações do disco emitem evento p/ UI live (badge baixado)
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockIsDesktopApp, mockGetDesktopBridge, mockReadCatalogRecord } =
  vi.hoisted(() => ({
    mockIsDesktopApp: vi.fn(() => true),
    mockGetDesktopBridge: vi.fn<() => unknown>(() => null),
    mockReadCatalogRecord: vi.fn(async () => ({
      url_music: 'musics/x.mp3',
    })),
  }))

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: mockIsDesktopApp,
  getDesktopBridge: mockGetDesktopBridge,
}))

vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: mockReadCatalogRecord,
}))

import {
  onTrackMediaChanged,
  offTrackMediaChanged,
  downloadTrackMedia,
  deleteTrackMedia,
} from '../track-media'

function bridgeMock(over: Record<string, unknown> = {}) {
  return {
    media: {
      check: vi.fn(async () => true),
      download: vi.fn(async () => true),
      delete: vi.fn(async () => true),
      ...over,
    },
  }
}

describe('track-media change events', () => {
  let listener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listener = vi.fn()
    vi.clearAllMocks()
    onTrackMediaChanged(listener)
    return () => offTrackMediaChanged(listener)
  })

  it('download concluído emite changed(id, true)', async () => {
    mockGetDesktopBridge.mockReturnValue(bridgeMock())
    const res = await downloadTrackMedia(42)
    expect(res.status).toBe('downloaded')
    expect(listener).toHaveBeenCalledWith(42, true)
  })

  it('delete emite changed(id, false)', async () => {
    mockGetDesktopBridge.mockReturnValue(bridgeMock())
    await deleteTrackMedia(42)
    expect(listener).toHaveBeenCalledWith(42, false)
  })

  it('offTrackMediaChanged remove listener', async () => {
    offTrackMediaChanged(listener)
    mockGetDesktopBridge.mockReturnValue(bridgeMock())
    await deleteTrackMedia(7)
    expect(listener).not.toHaveBeenCalled()
  })
})
