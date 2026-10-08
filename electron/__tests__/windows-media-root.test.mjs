// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  platform: 'win32',
}))

vi.mock('node:child_process', () => ({
  spawnSync: (...args) => mocks.spawnSync(...args),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    existsSync: (...args) => mocks.existsSync(...args),
    readFileSync: (...args) => mocks.readFileSync(...args),
    writeFileSync: (...args) => mocks.writeFileSync(...args),
    mkdirSync: (...args) => mocks.mkdirSync(...args),
    unlinkSync: (...args) => mocks.unlinkSync(...args),
  }
})

import {
  invalidateMediaRootCache,
  readWindowsMediaRootFromFile,
  readWindowsMediaRootOverride,
  resolveDefaultWindowsMediaRoot,
  resolveMediaRoot,
  resolveWindowsMediaRootUnderBase,
  writeWindowsMediaRootOverride,
  WINDOWS_MEDIA_ROOT_REG_KEY,
  WINDOWS_MEDIA_ROOT_REG_VALUE,
} from '../windows-media-root.mjs'

describe('windows-media-root', () => {
  let platformSpy

  beforeEach(() => {
    vi.clearAllMocks()
    invalidateMediaRootCache()
    mocks.spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' })
    mocks.existsSync.mockReturnValue(false)
    mocks.readFileSync.mockReturnValue('')
    mocks.writeFileSync.mockImplementation(() => undefined)
    mocks.mkdirSync.mockImplementation(() => undefined)
    mocks.unlinkSync.mockImplementation(() => undefined)
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue(mocks.platform)
    process.env.ProgramData = 'C:\\ProgramData'
  })

  afterEach(() => {
    platformSpy.mockRestore()
    delete process.env.ProgramData
  })

  it('resolveDefaultWindowsMediaRoot usa ProgramData\\LouvorJA-PIANO\\Media', () => {
    expect(resolveDefaultWindowsMediaRoot()).toBe(
      'C:\\ProgramData\\LouvorJA-PIANO\\Media',
    )
  })

  it('resolveWindowsMediaRootUnderBase acrescenta LouvorJA-PIANO\\Media', () => {
    expect(resolveWindowsMediaRootUnderBase('D:\\')).toBe(
      'D:\\LouvorJA-PIANO\\Media',
    )
    expect(resolveWindowsMediaRootUnderBase('D:\\Dados')).toBe(
      'D:\\Dados\\LouvorJA-PIANO\\Media',
    )
    expect(resolveWindowsMediaRootUnderBase('E:\\LouvorJA-PIANO')).toBe(
      'E:\\LouvorJA-PIANO\\Media',
    )
    expect(resolveWindowsMediaRootUnderBase('E:\\LouvorJA-PIANO\\Media')).toBe(
      'E:\\LouvorJA-PIANO\\Media',
    )
    expect(resolveWindowsMediaRootUnderBase('')).toBe('')
  })

  it('readWindowsMediaRootFromFile lê .media-root', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue('D:\\LouvorJA-Media\n')

    expect(readWindowsMediaRootFromFile()).toBe('D:\\LouvorJA-Media')
  })

  it('arquivo tem prioridade sobre o registro', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue('D:\\FromFile')
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: `MediaRoot    REG_SZ    E:\\FromReg\n`,
      stderr: '',
    })

    expect(readWindowsMediaRootOverride()).toBe('D:\\FromFile')
  })

  it('resolveMediaRoot usa override do arquivo', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue('E:\\SharedMedia')

    expect(resolveMediaRoot('C:\\ProgramData\\LouvorJA-PIANO')).toBe(
      'E:\\SharedMedia',
    )
  })

  it('resolveMediaRoot cai para userData/Media sem override', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(false)
    mocks.spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' })

    expect(resolveMediaRoot('C:\\ProgramData\\LouvorJA-PIANO')).toBe(
      'C:\\ProgramData\\LouvorJA-PIANO\\Media',
    )
  })

  it('writeWindowsMediaRootOverride grava arquivo e tenta registro', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' })

    const result = writeWindowsMediaRootOverride('D:\\Media')
    expect(result.ok).toBe(true)
    expect(result.path).toBe('D:\\Media')
    expect(mocks.writeFileSync).toHaveBeenCalled()
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      'reg',
      expect.arrayContaining([
        'add',
        WINDOWS_MEDIA_ROOT_REG_KEY,
        '/v',
        WINDOWS_MEDIA_ROOT_REG_VALUE,
        '/reg:64',
      ]),
      expect.any(Object),
    )
  })

  it('writeWindowsMediaRootOverride(null) remove o arquivo .media-root', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(true)
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' })

    const result = writeWindowsMediaRootOverride(null)
    expect(result.ok).toBe(true)
    expect(result.path).toBeNull()
    expect(mocks.unlinkSync).toHaveBeenCalled()
  })

  it('resolveMediaRoot fora do Windows ignora override', () => {
    mocks.platform = 'linux'
    platformSpy.mockReturnValue('linux')

    expect(resolveMediaRoot('/var/lib/LouvorJA-PIANO')).toBe(
      '/var/lib/LouvorJA-PIANO/Media',
    )
  })

  it('resolveMediaRoot no Windows cacheia e não consulta o registro de novo', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(false)
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: 'MediaRoot    REG_SZ    E:\\FromReg\n',
      stderr: '',
    })

    const userData = 'C:\\ProgramData\\LouvorJA-PIANO'
    expect(resolveMediaRoot(userData)).toBe('E:\\FromReg')
    expect(resolveMediaRoot(userData)).toBe('E:\\FromReg')
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1)
  })

  it('writeWindowsMediaRootOverride invalida o cache', () => {
    mocks.platform = 'win32'
    platformSpy.mockReturnValue('win32')
    mocks.existsSync.mockReturnValue(false)
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: 'MediaRoot    REG_SZ    E:\\FromReg\n',
      stderr: '',
    })

    const userData = 'C:\\ProgramData\\LouvorJA-PIANO'
    expect(resolveMediaRoot(userData)).toBe('E:\\FromReg')

    mocks.writeFileSync.mockImplementation(() => undefined)
    writeWindowsMediaRootOverride('D:\\NovaMedia')
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue('D:\\NovaMedia\n')

    expect(resolveMediaRoot(userData)).toBe('D:\\NovaMedia')
  })
})
