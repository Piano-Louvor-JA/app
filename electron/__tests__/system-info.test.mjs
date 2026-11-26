// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map())
vi.mock('electron', () => ({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) } }))
import { readSystemInfo, registerSystemInfoIpc } from '../ipc/system-info.mjs'

/** Telemetria de dispositivos: SO legível para o painel (Fase 3). */
function fakeOs({ release = '1.0', version = '' } = {}) {
  return { release: () => release, version: () => version }
}

describe('system-info', () => {
  it('Windows 11 reporta "Windows 10" no os.version(): corrige pelo build >= 22000', () => {
    expect(
      readSystemInfo({ os: fakeOs({ release: '10.0.26100', version: 'Windows 10 Pro' }), platform: 'win32', arch: 'x64' }),
    ).toEqual({ platform: 'win32', name: 'Windows 11 Pro', release: '10.0.26100', arch: 'x64' })
    expect(
      readSystemInfo({ os: fakeOs({ release: '10.0.19045', version: 'Windows 10 Home' }), platform: 'win32', arch: 'ia32' }),
    ).toEqual({ platform: 'win32', name: 'Windows 10 Home', release: '10.0.19045', arch: 'ia32' })
  })

  it('macOS e Linux: nome amigável (Linux usa o PRETTY_NAME do os-release)', () => {
    expect(
      readSystemInfo({ os: fakeOs({ release: '24.1.0', version: 'Darwin Kernel Version 24.1.0' }), platform: 'darwin', arch: 'arm64' }).name,
    ).toBe('macOS')
    expect(
      readSystemInfo({
        os: fakeOs({ release: '7.0.0-42-generic', version: '#42 SMP' }),
        platform: 'linux',
        arch: 'x64',
        readOsRelease: () => 'NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 26.04 LTS"\nID=ubuntu\n',
      }).name,
    ).toBe('Ubuntu 26.04 LTS')
    expect(
      readSystemInfo({
        os: fakeOs({ release: '6.1' }),
        platform: 'linux',
        arch: 'x64',
        readOsRelease: () => {
          throw new Error('ENOENT')
        },
      }).name,
    ).toBe('Linux')
  })

  it('os.version() que lança não derruba', () => {
    const os = { release: () => '10.0.26100', version: () => { throw new Error('x') } }
    expect(readSystemInfo({ os, platform: 'win32', arch: 'x64' }).name).toBe('Windows')
  })

  it('registra o IPC system:info com os dados reais da máquina', async () => {
    registerSystemInfoIpc()
    const info = await handlers.get('system:info')()
    expect(info.platform).toBe(process.platform)
    expect(info.arch).toBe(process.arch)
    expect(typeof info.name).toBe('string')
    expect(typeof info.release).toBe('string')
  })
})
