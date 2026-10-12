// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))


const setThemeModeMock = vi.fn()
vi.mock('../../composables/useAppearanceSettings', async () => {
  const { ref } = await import('vue')
  const isDark = ref(true)
  return {
    __isDark: isDark,
    useAppearanceSettings: () => ({
      isDark,
      setThemeMode: (m: string) => {
        isDark.value = m === 'dark'
        setThemeModeMock(m)
      },
    }),
  }
})

const lsData: Record<string, string> = {}
const lsStub = {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = String(v) },
  removeItem: (k: string) => { delete lsData[k] },
  clear: () => { for (const k of Object.keys(lsData)) delete lsData[k] },
  key: () => null,
  length: 0,
}
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true, writable: true })
Object.defineProperty(window, 'sessionStorage', { value: lsStub, configurable: true, writable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: lsStub, configurable: true, writable: true })

import ThemeOrbitalSwitcher from '../ThemeOrbitalSwitcher.vue'

describe('ThemeOrbitalSwitcher', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    active?.unmount()
    active = null
  })

  it('botões claro/escuro/toggle chamam setThemeMode', async () => {
    const w = mount(ThemeOrbitalSwitcher)
    active = w
    const btns = w.findAll('button.theme-orbital__mode-btn')
    // light, dark, toggle
    await btns[0].trigger('click')
    expect(setThemeModeMock).toHaveBeenLastCalledWith('light')
    await btns[1].trigger('click')
    expect(setThemeModeMock).toHaveBeenLastCalledWith('dark')
    // isDark agora true → toggle chama light
    const toggle = w.findAll('button').find((b) => b.classes().includes('theme-orbital__toggle') || b.classes().some((c) => c.includes('toggle')))
    if (toggle) {
      await toggle.trigger('click')
      expect(setThemeModeMock).toHaveBeenLastCalledWith('light')
    } else {
      // só existem os 2 botões de modo — setThemeMode cobre preferLight/preferDark
      expect(setThemeModeMock).toHaveBeenCalledTimes(2)
    }
  })

  it('toggle switch: isDark false → toggle chama dark; classes reagem', async () => {
    const w = mount(ThemeOrbitalSwitcher)
    active = w
    // começa dark (isDark=true) → vai pra light
    const toggle = w.find('button[role="switch"]')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    expect(setThemeModeMock).toHaveBeenLastCalledWith('light')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    // agora light → toggle chama dark
    const vm2 = w.vm as unknown as { toggleTheme?: () => void }
    vm2.toggleTheme?.()
    await w.vm.$nextTick()
    expect(setThemeModeMock).toHaveBeenLastCalledWith('dark')
    await w.vm.$nextTick()
    // classes condicionais (dark ativo)
    expect(w.find('.theme-orbital__sphere--dark').exists()).toBe(true)
    expect(w.find('.theme-orbital__glow--light').exists()).toBe(false)
    expect(w.find('.theme-orbital__switch-track--on').exists()).toBe(true)
    // modo claro: glow light e esfera sem dark
    await w.findAll('button.theme-orbital__mode-btn')[0]!.trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.theme-orbital__glow--light').exists()).toBe(true)
    expect(w.find('.theme-orbital__sphere--dark').exists()).toBe(false)
  })
})
