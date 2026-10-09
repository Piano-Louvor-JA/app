// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ mode: 0o755 })),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  platform: 'darwin',
}))

vi.mock('node:child_process', () => ({
  spawnSync: (...args) => mocks.spawnSync(...args),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    chmodSync: (...args) => mocks.chmodSync(...args),
    mkdirSync: (...args) => mocks.mkdirSync(...args),
    statSync: (...args) => mocks.statSync(...args),
  }
})

describe('macos-shared-permissions', () => {
  let platformSpy

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform = 'darwin'
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue(mocks.platform)
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('cria pasta, aplica modo 2775 e tenta chown :staff no macOS', async () => {
    const { ensureMacSharedFolderPermissions, MACOS_SHARED_DIR_MODE } = await import(
      '../macos-shared-permissions.mjs'
    )

    ensureMacSharedFolderPermissions('/Users/Shared/LouvorJA-PIANO')

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/Users/Shared/LouvorJA-PIANO', { recursive: true })
    expect(mocks.chmodSync).toHaveBeenCalledWith('/Users/Shared/LouvorJA-PIANO', MACOS_SHARED_DIR_MODE)
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      'chown',
      ['-R', ':staff', '/Users/Shared/LouvorJA-PIANO'],
      { encoding: 'utf8' },
    )
  })

  it('ignora em plataformas que não são macOS', async () => {
    mocks.platform = 'linux'
    platformSpy.mockReturnValue('linux')

    const { ensureMacSharedFolderPermissions } = await import('../macos-shared-permissions.mjs')

    ensureMacSharedFolderPermissions('/Users/Shared/LouvorJA-PIANO')

    expect(mocks.mkdirSync).not.toHaveBeenCalled()
    expect(mocks.chmodSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })
})
