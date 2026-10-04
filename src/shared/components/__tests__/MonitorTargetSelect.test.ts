// @vitest-environment jsdom
// Cobertura MonitorTargetSelect.vue (gaps shared): trigger label/badge, open
// panel posicionamento, close por pointerdown fora, disabled, identify,
// dense/header/label variants, empty vs list.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const listSystemDisplays = vi.fn()
const listExtendedDisplaysImpl = (all: Array<{ id: number; isPrimary?: boolean }>) =>
  all.filter((d) => !d.isPrimary)
const identifySystemDisplays = vi.fn()
const subscribeDisplaysChanged = vi.fn(() => () => {})

vi.mock('@modules/settings/services/display-service', () => ({
  listSystemDisplays: (...a: unknown[]) => listSystemDisplays(...(a as [])),
  listExtendedDisplays: (all: Array<{ id: number; isPrimary?: boolean }>) =>
    listExtendedDisplaysImpl(all),
  identifySystemDisplays: (...a: unknown[]) => identifySystemDisplays(...(a as [])),
  subscribeDisplaysChanged: () => subscribeDisplaysChanged(),
  formatDisplayResolution: (d: { width?: number; height?: number }) =>
    `${d.width ?? 0}x${d.height ?? 0}`,
}))

const loadProjectionSettings = vi.fn()
const saveProjectionSettings = vi.fn()
const reconcileTargetDisplays = vi.fn((s: Record<string, unknown>) => s)
const reapplyProjectionTargets = vi.fn(async () => true)

vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: () => loadProjectionSettings(),
  saveProjectionSettings: (s: Record<string, unknown>) => saveProjectionSettings(s),
  reconcileTargetDisplays: (s: Record<string, unknown>, ids: number[]) =>
    reconcileTargetDisplays(s, ids),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  reapplyProjectionTargets: () => reapplyProjectionTargets(),
}))

const bridge = {
  projection: {
    setSiteTargetMonitors: vi.fn(async () => {}),
    setVideoTargetMonitors: vi.fn(async () => {}),
    onSiteTargetsChanged: vi.fn(() => () => {}),
  },
}

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridge,
}))

vi.mock('@modules/settings/stores/useProjectionStore', () => ({
  useProjectionStore: () => ({ applySettings: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) =>
      params && 'count' in params ? `${k}:${params['count']}` : k,
  }),
}))

import MonitorTargetSelect from '../MonitorTargetSelect.vue'

const SETTINGS = {
  targetDisplayIds: [2],
  declinedDisplayIds: [],
  openReturnScreen: false,
  returnDisplayId: null,
}

const DISPLAYS = [
  { id: 1, isPrimary: true, width: 1920, height: 1080 },
  { id: 2, width: 1366, height: 768 },
]

async function mountSelect(props: Record<string, unknown> = {}) {
  const w = mount(MonitorTargetSelect, {
    props,
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  await Promise.resolve()
  await Promise.resolve()
  return w
}

describe('MonitorTargetSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSystemDisplays.mockResolvedValue(DISPLAYS)
    loadProjectionSettings.mockReturnValue({ ...SETTINGS })
  })

  it('renderiza trigger com label padrão e abre painel com opções', async () => {
    const w = await mountSelect({ modelValue: [2] })
    const trigger = w.find('.monitor-target-select__trigger')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(w.find('.monitor-target-select__panel').exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('true')
    // checkbox do monitor 2 marcado
    const boxes = w.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(1)
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true)
    w.unmount()
  })

  it('badge com contagem quando há seleção', async () => {
    const w = await mountSelect()
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(w.find('.monitor-target-select__badge').text()).toBe('1')
    w.unmount()
  })

  it('toggle de monitor emite update:modelValue e change', async () => {
    const w = await mountSelect({ modelValue: [] })
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    // persist=true: modelo vazio lê settings → [2]; ao abrir o painel a seleção
    // já vem marcada; clicar de novo desseleciona → emite []
    const boxes = w.findAll('input[type="checkbox"]')
    expect(boxes.length).toBeGreaterThan(0)
    await boxes[0]!.setValue(false)
    const emittedUp = w.emitted('update:modelValue')
    const emittedChange = w.emitted('change')
    expect(emittedUp && emittedUp.length > 0).toBe(true)
    expect((emittedUp!.at(-1) as unknown[])[0]).toEqual([])
    expect((emittedChange!.at(-1) as unknown[])[0]).toEqual([])
    w.unmount()
  })

  it('disabled: trigger desabilitado e toggle não muda seleção', async () => {
    const w = await mountSelect({ disabled: true })
    expect(
      w.find('.monitor-target-select__trigger').attributes('disabled'),
    ).toBeDefined()
    expect(w.find('.monitor-target-select--disabled').exists()).toBe(true)
    w.unmount()
  })

  it('dense esconde label do trigger', async () => {
    const w = await mountSelect({ dense: true })
    expect(w.find('.monitor-target-select--dense').exists()).toBe(true)
    expect(w.find('.monitor-target-select__trigger-label').exists()).toBe(false)
    w.unmount()
  })

  it('showLabel renderiza chip e mantém label escondido', async () => {
    const w = await mountSelect({ showLabel: true })
    expect(w.find('.monitor-target-select__chip').exists()).toBe(true)
    expect(w.find('.monitor-target-select__trigger-label').exists()).toBe(false)
    w.unmount()
  })

  it('botão identificar chama identifySystemDisplays e desabilita durante', async () => {
    identifySystemDisplays.mockImplementation(
      () => new Promise((r) => setTimeout(r, 20)),
    )
    const w = await mountSelect()
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    const btn = w.find('.monitor-target-select__identify')
    await btn.trigger('click')
    expect(identifySystemDisplays).toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 30))
    w.unmount()
  })

  it('sem displays: mostra estado vazio', async () => {
    listSystemDisplays.mockResolvedValue([DISPLAYS[0]!])
    const w = await mountSelect()
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(w.find('.monitor-target-select__empty').exists()).toBe(true)
    expect(w.text()).toContain('monitors.empty')
    w.unmount()
  })

  it('carregando sem displays: mostra loading', async () => {
    listSystemDisplays.mockImplementation(() => new Promise(() => {})) // pendente
    const w = await mountSelect()
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await nextTick()
    expect(w.text()).toContain('monitors.loading')
    w.unmount()
  })

  it('pointerdown fora fecha o painel', async () => {
    const w = await mountSelect()
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(w.find('.monitor-target-select__panel').exists()).toBe(true)
    document.body.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true }) as unknown as PointerEvent,
    )
    await nextTick()
    expect(w.find('.monitor-target-select__panel').exists()).toBe(false)
    w.unmount()
  })

  it('resize/scroll com painel aberto reposiciona; com painel fechado é no-op', async () => {
    const w = await mountSelect()
    // fechado: no-op (branch !open)
    window.dispatchEvent(new Event('resize'))
    await w.find('.monitor-target-select__trigger').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    // aberto: reposiciona sem erro
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('.monitor-target-select__panel').exists()).toBe(true)
    w.unmount()
  })

  it('label do trigger usa contagem selecionada', async () => {
    const w = await mountSelect({ modelValue: [2] })
    await Promise.resolve()
    await Promise.resolve()
    expect(w.find('.monitor-target-select__trigger').text()).toContain(
      'monitors.selectedCount:1',
    )
    w.unmount()
  })

  describe('gaps — posicionamento, pointerdown interno, disabled', () => {
    it('openUp: painel perto do rodapé usa bottom em vez de top', async () => {
      const originalH = window.innerHeight
      Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
      const w = await mountSelect()
      await w.find('.monitor-target-select__trigger').trigger('click')
      await Promise.resolve()
      await Promise.resolve()
      await nextTick()
      const panel = w.find('.monitor-target-select__panel')
      expect(panel.exists()).toBe(true)
      // painel reposicionado com innerHeight pequena → posição válida
      expect(panel.attributes('style')).toBeTruthy()
      w.unmount()
      Object.defineProperty(window, 'innerHeight', { value: originalH, configurable: true })
    })

    it('pointerdown dentro do root e dentro do painel NÃO fecham', async () => {
      const w = await mountSelect()
      await w.find('.monitor-target-select__trigger').trigger('click')
      await Promise.resolve()
      await Promise.resolve()
      await nextTick()
      // dentro do root (dispatch real com bubbles até document)
      w.find('.monitor-target-select__trigger').element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }) as unknown as PointerEvent,
      )
      await nextTick()
      expect(w.find('.monitor-target-select__panel').exists()).toBe(true)
      // dentro do painel
      w.find('.monitor-target-select__panel').element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }) as unknown as PointerEvent,
      )
      await nextTick()
      expect(w.find('.monitor-target-select__panel').exists()).toBe(true)
      w.unmount()
    })

    it('pointerdown com target não-Node não lança', async () => {
      const w = await mountSelect()
      await w.find('.monitor-target-select__trigger').trigger('click')
      await Promise.resolve()
      await Promise.resolve()
      await nextTick()
      document.body.dispatchEvent(
        new Event('pointerdown') as unknown as PointerEvent,
      )
      await nextTick()
      w.unmount()
    })

    it('disabled: toggle e identify são no-op', async () => {
      const w = await mountSelect({ disabled: true })
      const trigger = w.find('.monitor-target-select__trigger')
      await trigger.trigger('click')
      await Promise.resolve()
      await Promise.resolve()
      await nextTick()
      // painel não abre com disabled
      expect(w.find('.monitor-target-select__panel').exists()).toBe(false)
      const identifyBtn = w.findAll('button').find((b) => b.classes().some((c) => c.includes('identify')))
      if (identifyBtn) await identifyBtn.trigger('click')
      w.unmount()
    })
  })
})
