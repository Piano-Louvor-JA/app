// @vitest-environment jsdom
// Cobertura ClockProjectionView.vue (gaps_map3: 88/62/70): storage events,
// BroadcastChannel, stage settings subscribe/unmount, stageStyle com/sem bg,
// effectiveConfig merge com stage.clock.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { name: 'ProjectionBackground', template: '<div class="pb-mock"><slot /></div>' },
}))

vi.mock('@shared/constants/storage-keys', () => ({
  BROWSER_STORAGE_KEYS: { userPreferences: 'user_preferences' },
  USER_PREFERENCE_KEYS: { clockConfig: 'clock_config' },
}))

const stageSettings = vi.hoisted(() => {
  const listeners: Array<() => void> = []
  return {
    listeners,
    settings: {
      backgroundColor: '#0a0a0a',
      backgroundImage: null as string | null,
      clock: null as Record<string, unknown> | null,
    },
    subscribe: (fn: () => void) => {
      listeners.push(fn)
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) }
    },
  }
})

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => JSON.parse(JSON.stringify(stageSettings.settings)),
  subscribeStageSettings: stageSettings.subscribe,
}))

vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: (bg: unknown) => (bg ? String(bg) : null),
  stageFlexAlign: () => ({ alignItems: 'center', justifyContent: 'center' }),
}))

const configState = vi.hoisted(() => ({
  stored: null as unknown,
  broadcast: null as unknown,
}))
vi.mock('../../services/clock-preferences', () => ({
  CLOCK_CONFIG_CHANNEL: 'louvorja-clock-config',
  loadClockConfig: () => configState.stored ?? { style: 'digital', showSeconds: true, format24h: true, textColor: '#ffffff', bgColor: '#000000' },
  normalizeClockConfig: (raw: unknown) => raw,
}))

vi.mock('../../components/ClockPreview.vue', () => ({
  default: {
    name: 'ClockPreview',
    props: ['config', 'stage', 'preview'],
    template: `<div class="clock-preview-mock" :data-style="config ? config.style : ''" :data-text="config ? config.textColor : ''" />`,
  },
}))

import ClockProjectionView from '../ClockProjectionView.vue'
import { createPinia } from 'pinia'

function mountView() {
  return mount(ClockProjectionView, { global: { plugins: [createPinia()] } })
}

beforeEach(() => {
  window.localStorage?.clear?.()
  vi.clearAllMocks()
  stageSettings.listeners.length = 0
  stageSettings.settings.clock = null
  stageSettings.settings.backgroundImage = null
  configState.stored = null
  configState.broadcast = null
})

describe('ClockProjectionView.vue', () => {
  it('renderiza ProjectionBackground com ClockPreview dentro', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.pb-mock').exists()).toBe(true)
    expect(w.find('.clock-preview-mock').exists()).toBe(true)
    w.unmount()
  })

  it('config default do loadClockConfig chega ao preview', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.clock-preview-mock').attributes('data-style')).toBe('digital')
    w.unmount()
  })

  it('storage event de userPreferences: recarrega config', async () => {
    const w = mountView()
    await flushPromises()
    configState.stored = { style: 'analog', showSeconds: false, format24h: false, textColor: '#00ff00', bgColor: '#111111' }
    window.dispatchEvent(new StorageEvent('storage', { key: 'user_preferences', newValue: '{}' }))
    await flushPromises()
    expect(w.find('.clock-preview-mock').attributes('data-style')).toBe('analog')
    w.unmount()
  })

  it('storage event com key null: recarrega (branch !key)', async () => {
    const w = mountView()
    await flushPromises()
    configState.stored = { style: 'analog', showSeconds: true, format24h: true, textColor: '#fff', bgColor: '#000' }
    window.dispatchEvent(new StorageEvent('storage', { key: null as unknown as string, newValue: '{}' }))
    await flushPromises()
    expect(w.find('.clock-preview-mock').attributes('data-style')).toBe('analog')
    w.unmount()
  })

  it('storage event de outra key: ignora (branch key !== userPreferences)', async () => {
    const w = mountView()
    await flushPromises()
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra', newValue: '{}' }))
    await flushPromises()
    expect(w.find('.clock-preview-mock').attributes('data-style')).toBe('digital')
    w.unmount()
  })

  it('stage com backgroundImage: url aplicada no style do bg (branch)', async () => {
    stageSettings.settings.backgroundImage = 'img://clock-bg.png'
    const w = mountView()
    await flushPromises()
    expect(w.find('.pb-mock').attributes('style')).toContain('img://clock-bg.png')
    w.unmount()
  })

  it('stage sem backgroundImage: só backgroundColor', async () => {
    const w = mountView()
    await flushPromises()
    const style = w.find('.pb-mock').attributes('style') ?? ''
    expect(style).toContain('rgb(10, 10, 10)')
    expect(style).not.toContain('url(')
    w.unmount()
  })

  it('stage.clock presente: effectiveConfig faz merge (stage < config)', async () => {
    stageSettings.settings.clock = { style: 'analog', showSeconds: false }
    configState.stored = { style: 'digital', showSeconds: true, format24h: true, textColor: '#ffffff', bgColor: '#000000' }
    const w = mountView()
    await flushPromises()
    const mock = w.find('.clock-preview-mock')
    // stage.clock sobrescreve o config do diálogo (fonte única do Palco)
    expect(mock.attributes('data-style')).toBe('analog')
    w.unmount()
  })

  it('subscribeStageSettings: update re-read; unmount desinscreve', async () => {
    const w = mountView()
    await flushPromises()
    const before = stageSettings.listeners.length
    expect(before).toBeGreaterThan(0)
    stageSettings.settings.backgroundImage = 'img://novo.png'
    stageSettings.listeners.forEach((fn) => fn())
    await flushPromises()
    expect(w.find('.pb-mock').attributes('style')).toContain('img://novo.png')
    w.unmount()
    expect(stageSettings.listeners.length).toBe(before - 1)
  })

  it('onUnmounted: remove storage listener', async () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const w = mountView()
    await flushPromises()
    w.unmount()
    expect(spy).toHaveBeenCalledWith('storage', expect.any(Function))
    spy.mockRestore()
  })
})
