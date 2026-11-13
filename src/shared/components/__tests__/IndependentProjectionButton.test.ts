// @vitest-environment jsdom
// Botão de projeção independente: desativado sem estendidos (com tooltip),
// monitores e conexões OBS como caixas de seleção (vários ao mesmo tempo), encerrar, preparação do módulo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'

vi.mock('@modules/settings/services/obs-detection', () => ({ detectObsBeforeProjection: vi.fn(async () => {}) }))

const monitors = ref<Array<{ id: number; index: number; resolutionLabel: string }>>([])
const activeMonitorIds = ref<number[]>([])
const activeMode = ref<'overlay' | 'share' | null>(null)
const project = vi.fn(async (id: number, mode: 'overlay' | 'share' = 'overlay') => {
  if (!activeMonitorIds.value.includes(id)) activeMonitorIds.value = [...activeMonitorIds.value, id]
  activeMode.value = mode
  return true
})
const unproject = vi.fn((id: number) => {
  activeMonitorIds.value = activeMonitorIds.value.filter((item) => item !== id)
  if (activeMonitorIds.value.length === 0) activeMode.value = null
})
const stop = vi.fn(() => {
  activeMonitorIds.value = []
  activeMode.value = null
})

vi.mock('@shared/composables/useIndependentProjection', () => ({
  useIndependentProjectionControl: () => ({
    monitors,
    available: computed(() => monitors.value.length > 0),
    loaded: ref(true),
    activeMonitorIds,
    activeMonitorId: computed(() => activeMonitorIds.value[0] ?? null),
    activeMode,
    project: (id: number, mode?: 'overlay' | 'share') => project(id, mode),
    unproject: (id: number) => unproject(id),
    stop: () => stop(),
  }),
}))

const projectionSettings = vi.hoisted(() => ({ targetDisplayIds: [2, 3] as number[] }))
vi.mock('@modules/settings/services/projection-preferences', () => ({
  loadProjectionSettings: () => ({ targetDisplayIds: [...projectionSettings.targetDisplayIds] }),
}))

const identifySystemDisplays = vi.fn(async () => true)
vi.mock('@modules/settings/services/display-service', () => ({
  identifySystemDisplays: () => identifySystemDisplays(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'index' in params ? `${key}:${params['index']}`
        : params && 'count' in params ? `${key}:${params['count']}` : key,
  }),
}))

import { obsAssignments, obsAssignmentModes } from '@modules/settings/services/obs-connections'
const obsOutputs = ref<Array<{ id: string; label: string; running: boolean; clients: number; selected: boolean }>>([])
vi.mock('@modules/settings/composables/useObsConnections', () => ({
  useObsConnections: () => ({ activeConnections: obsOutputs }),
}))

const palco = vi.hoisted(() => ({
  available: false,
  tvs: [] as Array<Record<string, unknown>>,
  changed: null as null | (() => void),
  pin: vi.fn(async () => true),
  stop: vi.fn(),
}))
vi.mock('@modules/settings/services/palco-clients', () => ({
  hasPalcoClients: () => palco.available,
  listPalcoTvs: vi.fn(async () => palco.tvs.map(tv => ({ ...tv }))),
  onPalcoClientsChanged: (cb: () => void) => { palco.changed = cb; return palco.stop },
  setPalcoTvPinned: (...args: unknown[]) => palco.pin(...(args as [])),
  palcoTvKey: (tv: { id?: string | null; ip: string; platform: string }) => tv.id ? tv.id : `${tv.ip}|${tv.platform}`,
}))
import { tvAssignments } from '@modules/settings/services/palco-tv-assignments'

import IndependentProjectionButton from '../IndependentProjectionButton.vue'

const EXTENDED = [
  { id: 2, index: 2, resolutionLabel: '1920 × 1080' },
  { id: 3, index: 3, resolutionLabel: '1280 × 720' },
]

function mountButton(props: Record<string, unknown> = {}) {
  return mount(IndependentProjectionButton, {
    props: { moduleId: 'clock', ...props },
    attachTo: document.body,
  })
}

function panel() {
  return document.body.querySelector('[data-testid="independent-projection-panel"]')
}

describe('IndependentProjectionButton', () => {
  beforeEach(() => {
    obsOutputs.value = []
    obsAssignments.value = {}
    monitors.value = [...EXTENDED]
    projectionSettings.targetDisplayIds = [2, 3]
    activeMonitorIds.value = []
    activeMode.value = null
    project.mockClear()
    unproject.mockClear()
    stop.mockClear()
    identifySystemDisplays.mockClear()
    document.body.innerHTML = ''
  })

  it('limita altura do menu e mostra encerrar antes dos destinos', async () => {
    monitors.value = [{ id: 2, index: 2, resolutionLabel: '1920 × 1080' }]
    activeMonitorIds.value = [2]
    const wrapper = mountButton({ moduleId: 'bible' })
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    await trigger.trigger('click')
    const menu = panel()!
    expect(menu.style.maxHeight).not.toBe('')
    const stopButton = menu.querySelector('[data-testid="independent-projection-stop"]')!
    const modes = menu.querySelector('.independent-projection__modes')!
    expect(stopButton.compareDocumentPosition(modes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })

  it('abre como popup no centro, com fundo; fecha pelo X e pelo fundo', async () => {
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    await trigger.trigger('click')
    const overlay = document.body.querySelector('[data-testid="independent-projection-overlay"]') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.contains(panel())).toBe(true)
    expect(panel()!.style.width).toContain('28rem')
    ;(document.body.querySelector('[data-testid="independent-projection-close"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    const backdrop = document.body.querySelector('[data-testid="independent-projection-overlay"]')!
    backdrop.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('monitores aparecem sob o título Conexões Cabeadas', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    expect(panel()!.querySelector('[data-testid="independent-wired-title"]')?.textContent).toContain('monitors.wiredTitle')
    wrapper.unmount()
  })

  it('sem conexões OBS mostra apenas a orientação para ativá-las', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    expect(panel()!.querySelector('.obs-outputs-empty')?.textContent).toContain('obsOutputs.activateHint')
    expect(panel()!.querySelector('ul[aria-label="obsOutputs.title"]')).toBeNull()
    wrapper.unmount()
  })

  it('oferece conexão OBS ativa mesmo sem monitor e atribui apenas o destino escolhido', async () => {
    monitors.value = []
    obsOutputs.value = [{ id: '7082', label: 'OBS 2', running: true, clients: 1, selected: true }]
    const beforeProject = vi.fn(() => true)
    const wrapper = mountButton({ moduleId: 'bible', beforeProject })
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('false')
    await trigger.trigger('click')
    expect(panel()!.querySelector('.obs-outputs-active')?.textContent).toContain('obsOutputs.active')
    expect(panel()!.querySelector('.independent-projection__option-meta')?.textContent).toBe('obsOutputs.activeConnections:1')
    expect(panel()!.querySelector('.obs-outputs-empty')).toBeNull()
    ;(panel()!.querySelector('[data-mode="share"]') as HTMLButtonElement).click()
    await flushPromises()
    const output = [...panel()!.querySelectorAll('button')].find((item) => item.textContent?.includes('OBS 2'))!
    output.click()
    await flushPromises()
    expect(obsAssignments.value).toEqual({ '7082': 'bible' })
    expect(obsAssignmentModes.value['7082']).toBe('share')
    expect(beforeProject).toHaveBeenCalledOnce()
    expect(project).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sem monitor estendido fica desativado com o aviso no tooltip', async () => {
    monitors.value = []
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('true')
    expect(trigger.attributes('title')).toBe('independentProjection.unavailable obsOutputs.activateHint')
    await trigger.trigger('click')
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('com estendidos abre a lista só com eles', async () => {
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('false')
    expect(trigger.attributes('title')).toBe('independentProjection.title')
    await trigger.trigger('click')
    const options = panel()!.querySelectorAll('[data-monitor-id]')
    expect([...options].map((el) => el.textContent)).toEqual([
      expect.stringContaining('independentProjection.monitor:2'),
      expect.stringContaining('independentProjection.monitor:3'),
    ])
    expect(panel()!.querySelector('[data-testid="independent-projection-stop"]')).toBeNull()
    wrapper.unmount()
  })

  it('caixas de seleção: marca vários monitores, a lista fica aberta e desmarcar tira só aquele', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    expect(panel()!.querySelector('[data-monitor-id="3"]')!.getAttribute('role')).toBe('checkbox')
    ;(panel()!.querySelector('[data-monitor-id="3"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(3, 'overlay')
    expect(panel()).not.toBeNull()
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(2, 'overlay')
    expect([...panel()!.querySelectorAll('[data-monitor-id][aria-checked="true"]')].map((el) => el.getAttribute('data-monitor-id'))).toEqual(['2', '3'])
    expect(panel()!.querySelector('[data-monitor-id="2"] .ti-square-check')).not.toBeNull()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.classes()).toContain('independent-projection__trigger--active')
    expect(trigger.attributes('title')).toBe('independentProjection.activeOn:2, 3')
    expect(trigger.text()).toBe('2, 3')

    ;(panel()!.querySelector('[data-monitor-id="3"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(unproject).toHaveBeenCalledWith(3)
    expect(trigger.text()).toBe('2')
    wrapper.unmount()
  })

  it('monitor desligado em "Telas" aparece desativado com o aviso; no ar ainda dá para desmarcar', async () => {
    projectionSettings.targetDisplayIds = [2]
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const off = panel()!.querySelector('[data-monitor-id="3"]') as HTMLButtonElement
    expect(off.disabled).toBe(true)
    expect(off.textContent).toContain('independentProjection.enableHint')
    expect(panel()!.querySelector('[data-monitor-id="2"]')!.textContent).not.toContain('independentProjection.enableHint')
    off.dispatchEvent(new MouseEvent('click'))
    await flushPromises()
    expect(project).not.toHaveBeenCalled()
    wrapper.unmount()

    activeMonitorIds.value = [3]
    const again = mountButton()
    await again.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const live = panel()!.querySelector('[data-monitor-id="3"]') as HTMLButtonElement
    expect(live.disabled).toBe(false)
    live.click()
    await flushPromises()
    expect(unproject).toHaveBeenCalledWith(3)
    again.unmount()
  })

  it('OBS: marca várias conexões junto com monitores; desmarcar tira só aquela', async () => {
    obsOutputs.value = [
      { id: '7082', label: 'OBS 2', running: true, clients: 1, selected: true },
      { id: '7083', label: 'OBS 3', running: true, clients: 2, selected: true },
    ]
    const wrapper = mountButton({ moduleId: 'bible' })
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    ;(panel()!.querySelector('[data-obs-id="7082"]') as HTMLButtonElement).click()
    await flushPromises()
    ;(panel()!.querySelector('[data-obs-id="7083"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(obsAssignments.value).toEqual({ '7082': 'bible', '7083': 'bible' })
    expect(activeMonitorIds.value).toEqual([2])
    expect(stop).not.toHaveBeenCalled()
    expect(panel()!.querySelector('[data-obs-id="7082"]')!.getAttribute('aria-checked')).toBe('true')
    ;(panel()!.querySelector('[data-obs-id="7082"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(obsAssignments.value).toEqual({ '7083': 'bible' })
    expect(activeMonitorIds.value).toEqual([2])
    wrapper.unmount()
  })

  it('falha ao projetar mantém a lista aberta', async () => {
    project.mockResolvedValueOnce(false)
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    wrapper.unmount()
  })

  it('beforeProject false cancela a projeção', async () => {
    const beforeProject = vi.fn(() => false)
    const wrapper = mountButton({ beforeProject })
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(beforeProject).toHaveBeenCalled()
    expect(project).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('beforeProject async true segue projetando', async () => {
    const wrapper = mountButton({ beforeProject: async () => true })
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(2, 'overlay')
    wrapper.unmount()
  })

  it('clique duplo enquanto projeta é ignorado', async () => {
    let resolve!: (value: boolean) => void
    project.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const option = panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement
    option.click()
    await flushPromises()
    // Botão desabilitado: o segundo clique chama onSelect direto via evento
    option.dispatchEvent(new MouseEvent('click'))
    expect(project).toHaveBeenCalledTimes(1)
    resolve(true)
    await flushPromises()
    wrapper.unmount()
  })

  it('ativo mostra marcado e permite encerrar', async () => {
    activeMonitorIds.value = [2]
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const checked = panel()!.querySelector('[data-monitor-id][aria-checked="true"]')
    expect(checked?.getAttribute('data-monitor-id')).toBe('2')
    ;(panel()!.querySelector('[data-testid="independent-projection-stop"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(stop).toHaveBeenCalled()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('identificar monitores chama o overlay numerado', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    ;(panel()!.querySelector('.independent-projection__identify') as HTMLButtonElement).click()
    expect(identifySystemDisplays).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('fecha com clique fora, ESC e ao perder os estendidos', async () => {
    const wrapper = mountButton()
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')

    await trigger.trigger('click')
    // Clique dentro do painel não fecha
    panel()!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    monitors.value = []
    await flushPromises()
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('pointerdown com lista fechada ou alvo não-Node é ignorado', async () => {
    const wrapper = mountButton()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const event = new Event('pointerdown')
    Object.defineProperty(event, 'target', { value: {} })
    document.dispatchEvent(event)
    await flushPromises()
    expect(panel()).not.toBeNull()
    // Clique no próprio botão alterna (fecha)
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('pointerdown')
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    expect(panel()).toBeNull()
    wrapper.unmount()
  })

  it('modo compartilhar projeta com share e muda ícone e tooltip', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    const overlay = panel()!.querySelector('[data-mode="overlay"]')!
    const share = panel()!.querySelector('[data-mode="share"]') as HTMLButtonElement
    expect(overlay.getAttribute('aria-checked')).toBe('true')
    expect(panel()!.textContent).toContain('independentProjection.hint')
    share.click()
    await flushPromises()
    expect(share.getAttribute('aria-checked')).toBe('true')
    expect(panel()!.textContent).toContain('independentProjection.hintShare')
    ;(panel()!.querySelector('[data-monitor-id="2"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(project).toHaveBeenCalledWith(2, 'share')
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('title')).toBe('independentProjection.sharedOn:2')
    expect(trigger.find('.ti').classes()).toContain('ti-layout-columns')
    wrapper.unmount()
  })

  it('ao reabrir, o modo começa no modo ativo', async () => {
    activeMonitorIds.value = [3]
    activeMode.value = 'share'
    const wrapper = mountButton()
    await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
    await flushPromises()
    expect(panel()!.querySelector('[data-mode="share"]')!.getAttribute('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('sem OBS: esconde as saídas OBS, mesmo ativas, e a dica de ativá-las', async () => {
    obsOutputs.value = [{ id: '7082', label: 'OBS 2', running: true, clients: 1, selected: true }]
    obsAssignments.value = { '7082': 'annotation' }
    const wrapper = mountButton({ moduleId: 'annotation', obs: false })
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.classes()).not.toContain('independent-projection__trigger--active')
    await trigger.trigger('click')
    expect(panel()!.querySelector('.obs-outputs-separator')).toBeNull()
    expect(panel()!.querySelector('.obs-outputs-empty')).toBeNull()
    expect(panel()!.querySelector('.obs-outputs-active')).toBeNull()
    expect(panel()!.textContent).not.toContain('OBS 2')
    wrapper.unmount()
  })

  it('sem OBS e sem monitor: tooltip não sugere ativar OBS', () => {
    monitors.value = []
    obsOutputs.value = [{ id: '7082', label: 'OBS 2', running: true, clients: 1, selected: true }]
    const wrapper = mountButton({ obs: false })
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.attributes('aria-disabled')).toBe('true')
    expect(trigger.attributes('title')).toBe('independentProjection.unavailable')
    wrapper.unmount()
  })

  it('não dono do conteúdo: não aparece ativo nem oferece encerrar', async () => {
    activeMonitorIds.value = [2]
    activeMode.value = 'share'
    const wrapper = mountButton({ claimed: false, compact: true })
    const trigger = wrapper.get('[data-testid="independent-projection-trigger"]')
    expect(trigger.classes()).toContain('independent-projection__trigger--compact')
    expect(trigger.classes()).not.toContain('independent-projection__trigger--active')
    expect(trigger.find('.independent-projection__badge').exists()).toBe(false)
    expect(trigger.find('.ti').classes()).toContain('ti-device-desktop-share')
    expect(trigger.attributes('title')).toBe('independentProjection.title')
    await trigger.trigger('click')
    expect(panel()!.querySelector('[data-testid="independent-projection-stop"]')).toBeNull()
    wrapper.unmount()
  })

  describe('TVs com Palco', () => {
    const tv = (extra: Record<string, unknown> = {}) => ({
      uid: 'u1', slotId: '0', slotLabel: 'Principal', ip: '10.0.0.5', platform: 'webos',
      name: 'TV da entrada', version: '0.3.1', id: 'a', muted: false, ...extra,
    })
    beforeEach(() => {
      palco.available = true
      palco.tvs = [tv(), tv({ uid: 'u2', id: 'b', name: 'TV LG' })]
      palco.pin.mockClear()
      tvAssignments.value = {}
    })

    it('lista as TVs e projeta o módulo só na TV marcada', async () => {
      monitors.value = []
      const wrapper = mountButton({ moduleId: 'bible' })
      await flushPromises()
      await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
      await flushPromises()
      const title = panel()!.querySelector('[data-testid="independent-palco-title"]')
      expect(title?.textContent).toContain('palcoOutputs.title')
      const first = panel()!.querySelector('[data-palco-tv="u1"]') as HTMLButtonElement
      first.click()
      await flushPromises()
      expect(tvAssignments.value).toEqual({ a: 'bible' })
      expect(palco.pin).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), true)
      expect(first.getAttribute('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="independent-projection-trigger"]').classes().join(' ')).toContain('active')

      first.click()
      await flushPromises()
      expect(tvAssignments.value).toEqual({})
      expect(palco.pin).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'u1' }), false)
      wrapper.unmount()
      expect(palco.stop).toHaveBeenCalled()
    })

    it('encerrar devolve as TVs do módulo à transmissão', async () => {
      tvAssignments.value = { a: 'clock', b: 'bible' }
      const wrapper = mountButton({ moduleId: 'clock' })
      await flushPromises()
      await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
      await flushPromises()
      ;(panel()!.querySelector('[data-testid="independent-projection-stop"]') as HTMLButtonElement).click()
      await flushPromises()
      expect(tvAssignments.value).toEqual({ b: 'bible' })
      wrapper.unmount()
    })

    it('módulos sem desenho independente (obs=false) não listam TVs', async () => {
      const wrapper = mountButton({ moduleId: 'annotation', obs: false })
      await flushPromises()
      await wrapper.get('[data-testid="independent-projection-trigger"]').trigger('click')
      await flushPromises()
      expect(panel()!.querySelector('[data-testid="independent-palco-title"]')).toBeNull()
      wrapper.unmount()
    })
  })
})
