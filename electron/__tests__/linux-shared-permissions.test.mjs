// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ mode: 0o755 })),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  platform: 'linux',
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
    writeFileSync: (...args) => mocks.writeFileSync(...args),
    unlinkSync: (...args) => mocks.unlinkSync(...args),
    statSync: (...args) => mocks.statSync(...args),
  }
})

describe('linux-shared-permissions', () => {
  let platformSpy

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform = 'linux'
    mocks.mkdirSync.mockImplementation(() => undefined)
    mocks.writeFileSync.mockImplementation(() => undefined)
    mocks.unlinkSync.mockImplementation(() => undefined)
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' })
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue(mocks.platform)
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('cria pasta e aplica modo 1777 no Linux', async () => {
    const { ensureLinuxSharedFolderPermissions, LINUX_SHARED_DIR_MODE } = await import(
      '../linux-shared-permissions.mjs'
    )

    ensureLinuxSharedFolderPermissions('/var/lib/LouvorJA-PIANO')

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/var/lib/LouvorJA-PIANO', { recursive: true })
    expect(mocks.chmodSync).toHaveBeenCalledWith('/var/lib/LouvorJA-PIANO', LINUX_SHARED_DIR_MODE)
  })

  it('ignora em plataformas que não são Linux', async () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')

    const { ensureLinuxSharedFolderPermissions } = await import('../linux-shared-permissions.mjs')

    ensureLinuxSharedFolderPermissions('/var/lib/LouvorJA-PIANO')

    expect(mocks.mkdirSync).not.toHaveBeenCalled()
    expect(mocks.chmodSync).not.toHaveBeenCalled()
  })

  it('ensureLinuxSharedFolderAvailable usa pkexec quando mkdir falha', async () => {
    let mkdirCalls = 0
    mocks.mkdirSync.mockImplementation(() => {
      mkdirCalls += 1
      if (mkdirCalls <= 2) {
        const error = new Error('EACCES')
        error.code = 'EACCES'
        throw error
      }
    })

    const { ensureLinuxSharedFolderAvailable } = await import('../linux-shared-permissions.mjs')

    expect(ensureLinuxSharedFolderAvailable('/var/lib/LouvorJA-PIANO')).toBe(true)
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      'pkexec',
      expect.arrayContaining(['/bin/sh', '-c', expect.stringContaining('chmod 1777')]),
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('script de elevação usa 1777 e setfacl (não grupo users)', async () => {
    const { buildLinuxSharedFolderElevationScript } = await import('../linux-shared-permissions.mjs')
    const script = buildLinuxSharedFolderElevationScript('/var/lib/LouvorJA-PIANO')

    expect(script).toContain('chmod 1777')
    expect(script).toContain('setfacl')
    expect(script).not.toContain('chown root:users')
  })

  it('createLinuxSharedFolderWithElevation recusa caminho inesperado', async () => {
    const { createLinuxSharedFolderWithElevation } = await import('../linux-shared-permissions.mjs')

    expect(createLinuxSharedFolderWithElevation('/tmp/evil')).toBe(false)
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })
})
