// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock do electron ANTES dos imports que o usam.
vi.mock("electron", () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  screen: Object.assign(
    vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    }))(),
    { on: vi.fn(), off: vi.fn(), removeAllListeners: vi.fn() },
  ),
  session: { defaultSession: {} },
  WebContentsView: vi.fn(),
}))

// Mock do web-projection — só o que o register usa.
const closeWebProjectionWindows = vi.fn()
vi.mock("../ipc/web-projection.mjs", () => ({
  closeWebProjectionWindows,
  // demoes usados pelo register — stubs inertes
  broadcastPlaybackSync: vi.fn(),
  getSourceMediaIdFor: vi.fn(() => null),
  getImageSlideState: vi.fn(),
  getPdfPageState: vi.fn(),
  getPptSlideState: vi.fn(),
  getSourceNavigationState: vi.fn(),
  getSourcePlaybackState: vi.fn(),
  getVideoTargetMonitorIds: vi.fn(() => []),
  openWebProjectionWindows: vi.fn(),
  registerProjectionCapturePermissions: vi.fn(),
  remoteGoBackSource: vi.fn(),
  remoteGoForwardSource: vi.fn(),
  remoteImageNext: vi.fn(),
  remoteImagePrev: vi.fn(),
  remotePdfNext: vi.fn(),
  remotePdfPrev: vi.fn(),
  remotePptNext: vi.fn(),
  remotePptPrev: vi.fn(),
  remotePauseSource: vi.fn(),
  remotePlaySource: vi.fn(),
  remoteReloadSource: vi.fn(),
  remoteSeekSource: vi.fn(),
  remoteSetVolumeSource: vi.fn(),
  remoteToggleMuteSource: vi.fn(),
  setSiteControlPanelOpen: vi.fn(),
  setSiteTargetMonitorIds: vi.fn(),
  getSiteTargetMonitorIds: vi.fn(() => []),
  setVideoTargetMonitorIds: vi.fn(),
  toggleSiteProjectionScreens: vi.fn(),
  toggleVideoProjectionScreens: vi.fn(),
}))
vi.mock("../ipc/presentation-convert.mjs", () => ({
  convertPresentationToPdf: vi.fn(),
}))

const { registerWorkspaceIpc } = await import("../ipc/register.mjs")

function registeredOnHandlers() {
  const calls = vi.mocked(ipcMainRef.on).mock.calls
  return calls.map(([channel]) => channel)
}

// ipcMain referenciado pelo mock — import direto do módulo mockado
import { ipcMain as ipcMainRef } from "electron"

describe("projection:video-ended (autoclose de vídeo)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerWorkspaceIpc()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("registra listener (send, não invoke)", () => {
    expect(registeredOnHandlers()).toContain("projection:video-ended")
  })

  it("fecha as janelas de projeção ao receber o evento", () => {
    const call = vi
      .mocked(ipcMainRef.on)
      .mock.calls.find(([channel]) => channel === "projection:video-ended")
    expect(call).toBeTruthy()
    const handler = call?.[1]
    handler?.({})
    expect(closeWebProjectionWindows).toHaveBeenCalledTimes(1)
  })

  it("não lança se closeWebProjectionWindows falhar", () => {
    closeWebProjectionWindows.mockImplementationOnce(() => {
      throw new Error("boom")
    })
    const call = vi
      .mocked(ipcMainRef.on)
      .mock.calls.find(([channel]) => channel === "projection:video-ended")
    const handler = call?.[1]
    expect(() => handler?.({})).not.toThrow()
  })
})
