// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  X11_RELAUNCH_MARKER,
  buildX11Relaunch,
  consumeX11RelaunchMarker,
  shouldRelaunchWithX11,
} from '../linux-display-backend.mjs'

const WAYLAND_ENV = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }
const ARGV = ['/opt/LouvorJA/louvorja-piano']

describe('shouldRelaunchWithX11', () => {
  it('relança no Linux com sessão Wayland e XWayland disponível', () => {
    expect(shouldRelaunchWithX11({ platform: 'linux', env: WAYLAND_ENV, argv: ARGV })).toBe(true)
  })

  it('detecta Wayland só pelo WAYLAND_DISPLAY (sessão sem XDG_SESSION_TYPE)', () => {
    const env = { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(true)
  })

  it('não relança fora do Linux', () => {
    expect(shouldRelaunchWithX11({ platform: 'win32', env: WAYLAND_ENV, argv: ARGV })).toBe(false)
    expect(shouldRelaunchWithX11({ platform: 'darwin', env: WAYLAND_ENV, argv: ARGV })).toBe(false)
  })

  it('não relança em sessão X11', () => {
    const env = { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(false)
  })

  it('não relança sem XWayland (DISPLAY ausente): X11 não abriria', () => {
    const env = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(false)
  })

  it('respeita --ozone-platform passado pelo usuário', () => {
    for (const flag of ['--ozone-platform=wayland', '--ozone-platform=x11', '--ozone-platform']) {
      expect(shouldRelaunchWithX11({ platform: 'linux', env: WAYLAND_ENV, argv: [...ARGV, flag] })).toBe(false)
    }
  })

  it('não entra em loop: já relançado não relança de novo', () => {
    const env = { ...WAYLAND_ENV, [X11_RELAUNCH_MARKER]: '1' }
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(false)
  })

  it('é automático: não há variável de ambiente que desligue o XWayland', () => {
    const env = { ...WAYLAND_ENV, LOUVORJA_WAYLAND_NATIVE: '1' }
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(true)
  })
})

describe('buildX11Relaunch', () => {
  it('reabre o mesmo executável com os argumentos + --ozone-platform=x11', () => {
    const argv = ['/opt/LouvorJA/louvorja-piano', '--foo', 'arquivo.slja']
    expect(buildX11Relaunch({ argv, env: {}, execPath: '/opt/LouvorJA/louvorja-piano' })).toEqual({
      command: '/opt/LouvorJA/louvorja-piano',
      args: ['--foo', 'arquivo.slja', '--ozone-platform=x11'],
    })
  })

  it('AppImage reabre pelo próprio .AppImage (o mount some quando o pai sai)', () => {
    const argv = ['/tmp/.mount_LouvorXYZ/louvorja-piano']
    const env = { APPIMAGE: '/home/u/LouvorJA.AppImage' }
    expect(buildX11Relaunch({ argv, env, execPath: '/tmp/.mount_LouvorXYZ/louvorja-piano' })).toEqual({
      command: '/home/u/LouvorJA.AppImage',
      args: ['--ozone-platform=x11'],
    })
  })
})

describe('consumeX11RelaunchMarker', () => {
  it('remove a marca para filhos (auto-update) não herdarem e pularem o relaunch', () => {
    const env = { ...WAYLAND_ENV, [X11_RELAUNCH_MARKER]: '1' }
    expect(consumeX11RelaunchMarker(env)).toBe(true)
    expect(env[X11_RELAUNCH_MARKER]).toBeUndefined()
    expect(shouldRelaunchWithX11({ platform: 'linux', env, argv: ARGV })).toBe(true)
  })

  it('retorna false quando o processo não foi relançado', () => {
    expect(consumeX11RelaunchMarker({ ...WAYLAND_ENV })).toBe(false)
  })
})
