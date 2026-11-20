// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_OVERLAY_STYLE,
  DEFAULT_TRANSMISSION,
  DEFAULT_WS_PORT,
  LEGACY_HTTP_PORT,
  listenHostFor,
  migrateLegacyPort,
  normalizeOverlayStyle,
  rankInterfaces,
  readTransmissionConfig,
  resolveBind,
  saveTransmissionConfig,
  suggestPort,
  validatePort,
  // @ts-ignore Native runtime module.
} from '../transmission-config.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'piano-transmission-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('transmission config file', () => {
  it('falls back to defaults when the file is missing or corrupt', () => {
    expect(readTransmissionConfig(path.join(root, 'missing.json'))).toEqual(DEFAULT_TRANSMISSION)
    const corrupt = path.join(root, 'corrupt.json')
    writeFileSync(corrupt, '{nope', 'utf8')
    expect(readTransmissionConfig(corrupt)).toEqual({ bind: 'all', requireToken: true })
  })

  it('roundtrips bind and token requirement', () => {
    const file = path.join(root, 'nested', 'palco-transmission.json')
    saveTransmissionConfig(file, { bind: '192.168.0.10', requireToken: false })
    expect(readTransmissionConfig(file)).toEqual({ bind: '192.168.0.10', requireToken: false })
    saveTransmissionConfig(file, { bind: 'local', requireToken: true })
    expect(readTransmissionConfig(file)).toEqual({ bind: 'local', requireToken: true })
  })

  it('drops invalid bind values and keeps the token required unless explicitly disabled', () => {
    const file = path.join(root, 'invalid.json')
    writeFileSync(file, JSON.stringify({ bind: '999.1.1.1', requireToken: 'no' }), 'utf8')
    expect(readTransmissionConfig(file)).toEqual({ bind: 'all', requireToken: true })
    saveTransmissionConfig(file, { bind: 'eth0', requireToken: 0 })
    expect(readTransmissionConfig(file)).toEqual({ bind: 'all', requireToken: true })
  })
})

describe('network interfaces', () => {
  const sample = {
    'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.29.0.1' }],
    docker0: [{ family: 'IPv4', internal: false, address: '172.17.0.1' }],
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    'Wi-Fi': [
      { family: 'IPv6', internal: false, address: 'fe80::1' },
      { family: 'IPv4', internal: false, address: '192.168.0.130' },
    ],
    tun0: [{ family: 'IPv4', internal: false, address: '100.64.3.2' }],
    Ethernet: [{ family: 4, internal: false, address: '10.0.0.5' }],
  }

  it('lists external IPv4 only, private physical adapters first and virtual ones last', () => {
    expect(rankInterfaces(sample)).toEqual([
      { name: 'Wi-Fi', address: '192.168.0.130', virtual: false },
      { name: 'Ethernet', address: '10.0.0.5', virtual: false },
      { name: 'tun0', address: '100.64.3.2', virtual: false },
      { name: 'vEthernet (WSL)', address: '172.29.0.1', virtual: true },
      { name: 'docker0', address: '172.17.0.1', virtual: true },
    ])
    expect(rankInterfaces(undefined)).toEqual([])
  })

  it('resolves the listen host and the host printed in links', () => {
    const ranked = rankInterfaces(sample)
    expect(resolveBind('all', ranked)).toEqual({ bind: 'all', listenHost: '0.0.0.0', linkHost: '192.168.0.130', missing: false })
    expect(resolveBind('local', ranked)).toEqual({ bind: 'local', listenHost: '127.0.0.1', linkHost: '127.0.0.1', missing: false })
    expect(resolveBind('10.0.0.5', ranked)).toEqual({ bind: '10.0.0.5', listenHost: '10.0.0.5', linkHost: '10.0.0.5', missing: false })
  })

  it('falls back to every network when the saved address left the machine', () => {
    const ranked = rankInterfaces(sample)
    expect(resolveBind('192.168.5.5', ranked)).toEqual({ bind: 'all', listenHost: '0.0.0.0', linkHost: '192.168.0.130', missing: true })
    expect(resolveBind('all', [])).toEqual({ bind: 'all', listenHost: '0.0.0.0', linkHost: '127.0.0.1', missing: false })
  })

  it('maps bind choices straight to listen addresses', () => {
    expect(listenHostFor('all')).toBe('0.0.0.0')
    expect(listenHostFor('local')).toBe('127.0.0.1')
    expect(listenHostFor('10.1.2.3')).toBe('10.1.2.3')
  })
})

describe('ports', () => {
  it('accepts free pairs inside the allowed range', () => {
    expect(validatePort(9000, [7080, 7082])).toEqual({ ok: true })
    expect(validatePort(7084, [7080, 7082])).toEqual({ ok: true })
  })

  it('rejects out of range, fractional and colliding ports', () => {
    expect(validatePort(1023, [])).toEqual({ ok: false, reason: 'range' })
    expect(validatePort(65535, [])).toEqual({ ok: false, reason: 'range' })
    expect(validatePort(8000.5, [])).toEqual({ ok: false, reason: 'range' })
    expect(validatePort('8000', [])).toEqual({ ok: false, reason: 'range' })
    expect(validatePort(7081, [7080])).toEqual({ ok: false, reason: 'collision' })
    expect(validatePort(7079, [7080])).toEqual({ ok: false, reason: 'collision' })
    expect(validatePort(7080, [7080])).toEqual({ ok: false, reason: 'collision' })
  })

  it('suggests the next pair that fits, skipping busy ones', () => {
    expect(suggestPort(7080, [7080, 7082])).toBe(7084)
    expect(suggestPort(7082, [7080], [7082, 7084])).toBe(7086)
    expect(suggestPort(65534, [])).toBe(65534)
    expect(suggestPort(65534, [65534])).toBeNull()
  })
})

describe('default ports', () => {
  it('uses 47080/47081 and moves ports saved in the old automatic range', () => {
    expect([DEFAULT_HTTP_PORT, DEFAULT_WS_PORT, LEGACY_HTTP_PORT]).toEqual([47080, 47081, 7080])
    expect(migrateLegacyPort(7080)).toBe(47080)
    expect(migrateLegacyPort(7082)).toBe(47082)
    expect(migrateLegacyPort(7110)).toBe(47110)
    expect(migrateLegacyPort(7112)).toBe(7112)
    expect(migrateLegacyPort(7081)).toBe(7081)
    expect(migrateLegacyPort(7078)).toBe(7078)
    expect(migrateLegacyPort(9100)).toBe(9100)
    expect(migrateLegacyPort(Number.NaN)).toBeNaN()
  })
})

describe('overlay style', () => {
  it('fills defaults for missing or invalid fields', () => {
    expect(normalizeOverlayStyle(undefined)).toEqual(DEFAULT_OVERLAY_STYLE)
    expect(normalizeOverlayStyle({ layout: 'wide', theme: 'neon', position: 'left', textScale: 'big', showHeading: 'yes', accentColor: 'red', bandOpacity: 'x' }))
      .toEqual(DEFAULT_OVERLAY_STYLE)
    expect(DEFAULT_OVERLAY_STYLE.bandOpacity).toBe(60)
  })

  it('keeps valid values, clamps the scale to steps of ten and normalizes colors', () => {
    expect(normalizeOverlayStyle({ layout: 'fullscreen', theme: 'transparent', position: 'top', textScale: 134, showHeading: false, accentColor: '#a1b2c3', bandOpacity: 33 }))
      .toEqual({ layout: 'fullscreen', theme: 'transparent', position: 'top', textScale: 130, showHeading: false, accentColor: '#A1B2C3', bandOpacity: 35 })
    expect(normalizeOverlayStyle({ textScale: 10 }).textScale).toBe(70)
    expect(normalizeOverlayStyle({ textScale: 400 }).textScale).toBe(160)
    expect(normalizeOverlayStyle({ bandOpacity: -10 }).bandOpacity).toBe(0)
    expect(normalizeOverlayStyle({ bandOpacity: 150 }).bandOpacity).toBe(100)
  })
})
