// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))

import {
  parseStageSettings,
  serializeStageSettings,
  resolveBackgroundImage,
  officialBgUrl,
  OFFICIAL_BG_PREFIX,
} from '../stage-settings'

describe('stage-settings — parse/serialize gaps', () => {
  it('parseStageSettings: raw inválido retorna defaults', () => {
    expect(parseStageSettings(null)).toBeTruthy()
    expect(parseStageSettings('x')).toBeTruthy()
    expect(parseStageSettings(42)).toBeTruthy()
  })

  it('parseStageSettings: clamp de size fora da faixa', () => {
    const s = parseStageSettings({ size: 999, margin: 9999, tsBlur: 99, tsInt: 9, boxBg: 9 })
    expect(s.fontSize).toBeLessThanOrEqual(160)
    expect(s.margin).toBeLessThanOrEqual(480)
    expect(s.shadowBlur).toBeLessThanOrEqual(5)
    expect(s.shadowIntensity).toBeLessThanOrEqual(1)
    expect(s.boxOpacity).toBeLessThanOrEqual(0.9)
  })

  it('parseStageSettings: tAlign/tVAlign inválidos caem no default', () => {
    const s = parseStageSettings({ tAlign: 'diagonal', tVAlign: 'diagonal' })
    expect(s.textAlign).toBe('center')
    expect(s.textVerticalAlign).toBe('middle')
  })

  it('parseStageSettings: weight inválido cai no default', () => {
    const s = parseStageSettings({ weight: 123, bWeight: 999 })
    expect(s.fontWeight).toBe(600)
  })

  it('parseStageSettings: clock nested com style inválido → digital', () => {
    const s = parseStageSettings({ clock: { style: 'sundial', showSeconds: true } })
    expect(s.clock?.style).toBe('digital')
    expect(s.clock?.showSeconds).toBe(true)
  })

  it('parseStageSettings: bgImg data: aceito, relativo vira null', () => {
    const ok = parseStageSettings({ bgImg: 'data:image/png;base64,xx' })
    expect(ok.backgroundImage).toContain('data:')
    const no = parseStageSettings({ bgImg: '/tmp/evil.png' })
    expect(no.backgroundImage).toBeNull()
  })

  it('resolveBackgroundImage: official prefix → URL; null → null', () => {
    expect(resolveBackgroundImage(null)).toBeNull()
    const official = resolveBackgroundImage(`${OFFICIAL_BG_PREFIX}bg1`)
    expect(typeof official).toBe('string')
    expect(resolveBackgroundImage('https://x/y.png')).toBe('https://x/y.png')
  })

  it('officialBgUrl: desconhecido cai no fallback', () => {
    expect(officialBgUrl('definitivamente-inexistente-xyz')).toBe('/backgrounds/definitivamente-inexistente-xyz.png')
  })

  it('serialize+parse roundtrip preserva campos principais', () => {
    const s = parseStageSettings({})
    const back = parseStageSettings(serializeStageSettings(s))
    expect(back.fontSize).toBe(s.fontSize)
    expect(back.textAlign).toBe(s.textAlign)
    expect(back.backgroundColor).toBe(s.backgroundColor)
  })
})
