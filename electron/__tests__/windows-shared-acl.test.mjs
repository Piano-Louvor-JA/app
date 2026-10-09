// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawnSync: (...args) => mocks.spawnSync(...args),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    mkdirSync: (...args) => mocks.mkdirSync(...args),
    existsSync: (...args) => mocks.existsSync(...args),
    writeFileSync: (...args) => mocks.writeFileSync(...args),
  }
})

describe('windows-shared-acl', () => {
  let platformSpy

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockReturnValue(false)
    mocks.spawnSync.mockReturnValue({ status: 0 })
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  })

  afterEach(() => {
    platformSpy.mockRestore()
  })

  it('chama icacls na pasta (sem /T) e grava a marca', async () => {
    const { ensureWindowsSharedFolderAcl, WINDOWS_ACL_FLAG } = await import(
      '../windows-shared-acl.mjs'
    )
    ensureWindowsSharedFolderAcl('C:\\ProgramData\\LouvorJA-PIANO')

    expect(mocks.mkdirSync).toHaveBeenCalledWith('C:\\ProgramData\\LouvorJA-PIANO', {
      recursive: true,
    })
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      expect.stringContaining('icacls.exe'),
      [
        'C:\\ProgramData\\LouvorJA-PIANO',
        '/grant',
        '*S-1-5-32-545:(OI)(CI)M',
        '/C',
      ],
      expect.objectContaining({ windowsHide: true, timeout: 4_000 }),
    )
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      `C:\\ProgramData\\LouvorJA-PIANO\\${WINDOWS_ACL_FLAG}`,
      '1\n',
      'utf8',
    )
  })

  it('não percorre a árvore com /T', async () => {
    const { ensureWindowsSharedFolderAcl } = await import('../windows-shared-acl.mjs')
    ensureWindowsSharedFolderAcl('C:\\ProgramData\\LouvorJA-PIANO')
    const args = mocks.spawnSync.mock.calls[0][1]
    expect(args).not.toContain('/T')
  })

  it('pula icacls quando a marca já existe', async () => {
    mocks.existsSync.mockReturnValue(true)
    const { ensureWindowsSharedFolderAcl } = await import('../windows-shared-acl.mjs')
    ensureWindowsSharedFolderAcl('C:\\ProgramData\\LouvorJA-PIANO')
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })

  it('não faz nada fora do Windows', async () => {
    platformSpy.mockReturnValue('linux')
    const { ensureWindowsSharedFolderAcl } = await import('../windows-shared-acl.mjs')
    ensureWindowsSharedFolderAcl('C:\\ProgramData\\LouvorJA-PIANO')
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })
})
