// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

// mocks de tudo que main.ts importa
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, createApp: vi.fn(() => ({ use: vi.fn(), mount: vi.fn(() => ({})) })) }
})
vi.mock('pinia', () => ({ createPinia: vi.fn(() => ({})) }))
vi.mock('../App.vue', () => ({ default: { name: 'App', render: () => null } }))
vi.mock('@styles/tailwind.css', () => ({}))
vi.mock('@plugins/vuetify', () => ({ default: {} }))
vi.mock('@plugins/i18n', () => ({ default: {} }))
vi.mock('@/router', () => ({ default: {} }))
vi.mock('@design-system/composables', () => ({ useThemeManager: vi.fn() }))
vi.mock('@shared/composables/useUiZoom', () => ({ initUiZoom: vi.fn() }))
vi.mock('@shared/services/projection-window-location', () => ({
  isProjectionPopupLocation: vi.fn(() => false),
}))
vi.mock('@modules/remote/renderer/liturgy-bridge', () => ({ installRemoteLiturgyBridge: vi.fn() }))

import { createApp } from 'vue'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'
import { installRemoteLiturgyBridge } from '@modules/remote/renderer/liturgy-bridge'

describe('main.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('janela principal: monta app e instala bridge remota', async () => {
    vi.mocked(isProjectionPopupLocation).mockReturnValue(false)
    await import('../main')
    expect(createApp).toHaveBeenCalled()
    expect(installRemoteLiturgyBridge).toHaveBeenCalled()
  })

  it('janela de projeção: esconde splash e NÃO instala bridge', async () => {
    vi.mocked(isProjectionPopupLocation).mockReturnValue(true)
    const splash = document.createElement('div')
    splash.id = 'boot-splash'
    document.body.appendChild(splash)
    await import('../main')
    expect(installRemoteLiturgyBridge).not.toHaveBeenCalled()
    expect(splash.hidden).toBe(true)
  })
})
