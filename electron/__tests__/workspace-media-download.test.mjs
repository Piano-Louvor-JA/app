// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  resolveMediaDirectory: vi.fn(() => '/media'),
  resolveMediaFetchUrl: vi.fn((requestedUrl) => requestedUrl),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(),
  pipeline: vi.fn(),
  fromWeb: vi.fn(),
  randomUUID: vi.fn(() => 'attempt-id'),
  Transform: class {},
}))

vi.mock('node:crypto', () => ({ randomUUID: mocks.randomUUID }))
vi.mock('electron', () => ({ net: { fetch: mocks.fetch } }))
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
  renameSync: mocks.renameSync,
  unlinkSync: mocks.unlinkSync,
  createWriteStream: mocks.createWriteStream,
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}))
vi.mock('node:stream', () => ({ Readable: { fromWeb: mocks.fromWeb }, Transform: mocks.Transform }))
vi.mock('node:stream/promises', () => ({ pipeline: mocks.pipeline }))
vi.mock('../api-base.mjs', () => ({ resolveMediaFetchUrl: mocks.resolveMediaFetchUrl }))
vi.mock('../constants.mjs', () => ({ API_BASE_URL: 'https://api.test' }))
vi.mock('../crypto.mjs', () => ({ obfuscateText: vi.fn(), revealText: vi.fn() }))
vi.mock('../paths.mjs', () => ({
  ensureWorkspaceDirectories: vi.fn(),
  getWorkspacePaths: vi.fn(),
  resetWorkspaceDirectories: vi.fn(),
  resolveMediaDirectory: mocks.resolveMediaDirectory,
}))

const { downloadMediaFile, MEDIA_DOWNLOAD_STALL_TIMEOUT_MS } = await import('../workspace.mjs')

describe('downloadMediaFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetch.mockResolvedValue({
      ok: true,
      url: 'https://cdn.test/song.mp3',
      status: 200,
      body: { getReader: vi.fn() },
    })
    mocks.fromWeb.mockReturnValue({ on: vi.fn() })
    mocks.createWriteStream.mockReturnValue({})
    mocks.pipeline.mockResolvedValue(undefined)
  })

  afterEach(() => vi.useRealTimers())

  it('writes to a sibling part file then atomically renames only after stream completion', async () => {
    await expect(downloadMediaFile('https://cdn.test/song.mp3', 'music', 'album/song.mp3')).resolves.toBe(true)

    expect(mocks.fetch).toHaveBeenCalledWith('https://cdn.test/song.mp3', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mocks.createWriteStream).toHaveBeenCalledWith('/media/album/song.mp3.attempt-id.part')
    expect(mocks.pipeline).toHaveBeenCalledTimes(1)
    expect(mocks.renameSync).toHaveBeenCalledWith('/media/album/song.mp3.attempt-id.part', '/media/album/song.mp3')
  })

  it('returns HTTP failure bytes without creating a part file', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: false,
      url: 'https://cdn.test/missing.mp3',
      status: 404,
      body: { getReader: vi.fn() },
    })
    mocks.fromWeb.mockReturnValueOnce((async function* () { yield Buffer.alloc(12) })())

    await expect(downloadMediaFile('https://cdn.test/missing.mp3', 'music', 'missing.mp3')).resolves.toEqual({
      ok: false,
      url: 'https://cdn.test/missing.mp3',
      status: 404,
      bytes: 12,
      error: 'HTTP 404',
    })

    expect(mocks.createWriteStream).not.toHaveBeenCalled()
  })

  it('uses a 15 second inactivity timeout', () => {
    expect(MEDIA_DOWNLOAD_STALL_TIMEOUT_MS).toBe(15_000)
  })

  it('removes the part file and preserves the public failure shape when streaming fails', async () => {
    mocks.pipeline.mockRejectedValueOnce(new Error('socket closed'))

    await expect(downloadMediaFile('https://cdn.test/song.mp3', 'music', 'song.mp3')).resolves.toEqual({
      ok: false,
      url: 'https://cdn.test/song.mp3',
      status: 200,
      bytes: 0,
      error: 'socket closed',
    })

    expect(mocks.unlinkSync).toHaveBeenCalledWith('/media/song.mp3.attempt-id.part')
    expect(mocks.renameSync).not.toHaveBeenCalled()
  })
})
