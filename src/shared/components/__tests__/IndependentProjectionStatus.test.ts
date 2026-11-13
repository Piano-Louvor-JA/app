// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'

const monitors = ref([{ id: 2, index: 2, resolutionLabel: '' }, { id: 3, index: 3, resolutionLabel: '' }])
const activeMonitorIds = ref<number[]>([])
const activeMode = ref<'overlay' | 'share' | null>(null)
const stop = vi.fn(() => { activeMonitorIds.value = []; activeMode.value = null })
vi.mock('@shared/composables/useIndependentProjection', () => ({
  useIndependentProjectionControl: () => ({ monitors, activeMonitorIds, activeMode, stop, available: computed(() => true) }),
}))

const obsOutputs = ref<Array<{ id: string; label: string; nickname?: string; selected: boolean; clients: number }>>([])
vi.mock('@modules/settings/composables/useObsConnections', () => ({
  useObsConnections: () => ({ activeConnections: obsOutputs }),
}))

const palco = vi.hoisted(() => ({
  available: true,
  tvs: [] as Array<Record<string, unknown>>,
  changed: null as null | (() => void),
  stop: vi.fn(),
}))
vi.mock('@modules/settings/services/palco-clients', () => ({
  hasPalcoClients: () => palco.available,
  listPalcoTvs: vi.fn(async () => palco.tvs),
  setPalcoTvPinned: vi.fn(async () => true),
  onPalcoClientsChanged: (cb: () => void) => { palco.changed = cb; return palco.stop },
  palcoTvKey: (tv: { id?: string | null; ip: string; platform: string }) => tv.id ? tv.id : `${tv.ip}|${tv.platform}`,
}))
vi.mock('@modules/settings/services/palco-session', () => ({ palcoSession: { syncTvShare: vi.fn() } }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => params && 'index' in params ? `${key}:${params['index']}` : key,
  }),
}))

import { obsAssignmentModes, obsAssignments } from '@modules/settings/services/obs-connections'
import { tvAssignmentModes, tvAssignments } from '@modules/settings/services/palco-tv-assignments'
import IndependentProjectionStatus from '../IndependentProjectionStatus.vue'

async function mountStatus(props: Record<string, unknown> = {}) {
  const wrapper = mount(IndependentProjectionStatus, { props: { moduleId: 'bible', ...props } })
  await flushPromises()
  return wrapper
}

describe('IndependentProjectionStatus', () => {
  beforeEach(() => {
    activeMonitorIds.value = []
    activeMode.value = null
    obsOutputs.value = [{ id: '0', label: 'OBS', selected: false, clients: 3 }, { id: '47082', label: 'TV Frontal', selected: false, clients: 1 }]
    obsAssignments.value = {}
    obsAssignmentModes.value = {}
    tvAssignments.value = {}
    tvAssignmentModes.value = {}
    palco.available = true
    palco.tvs = [{ uid: 'u1', id: 'a', ip: '10.0.0.5', platform: 'webos', name: 'TV da entrada', slotId: '0' }]
  })

  it('sem nada no ar, não aparece', async () => {
    const wrapper = await mountStatus()
    expect(wrapper.find('[data-testid="independent-projection-status"]').exists()).toBe(false)
  })

  it('sobrepondo: lista monitores, conexões e TVs deste módulo', async () => {
    activeMonitorIds.value = [3]
    activeMode.value = 'overlay'
    obsAssignments.value = { '47082': 'bible', '0': 'clock' }
    tvAssignments.value = { a: 'bible' }
    const wrapper = await mountStatus()
    const groups = wrapper.findAll('.independent-status__group')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.attributes('data-mode')).toBe('overlay')
    expect(groups[0]!.text()).toContain('independentProjection.status.overlay')
    const items = wrapper.findAll('.independent-status__item').map(item => item.text())
    expect(items).toEqual(['independentProjection.status.monitor:3', 'TV Frontal', 'TV da entrada'])
  })

  it('separa o que está compartilhando do que está sobrepondo', async () => {
    activeMonitorIds.value = [2]
    activeMode.value = 'share'
    tvAssignments.value = { a: 'bible' }
    tvAssignmentModes.value = { a: 'overlay' }
    const wrapper = await mountStatus({ below: true })
    expect(wrapper.get('.independent-status').classes()).toContain('independent-status--below')
    const groups = wrapper.findAll('.independent-status__group')
    expect(groups.map(group => group.attributes('data-mode'))).toEqual(['overlay', 'share'])
    expect(groups[0]!.text()).toContain('TV da entrada')
    expect(groups[1]!.text()).toContain('independentProjection.status.monitor:2')
  })

  it('acompanha as TVs que conectam e para de ouvir ao sair', async () => {
    tvAssignments.value = { b: 'bible' }
    const wrapper = await mountStatus()
    expect(wrapper.find('.independent-status').exists()).toBe(false)
    palco.tvs = [{ uid: 'u2', id: 'b', ip: '10.0.0.6', platform: 'webos', name: 'TV LG', slotId: '0' }]
    palco.changed?.()
    await flushPromises()
    expect(wrapper.text()).toContain('TV LG')
    wrapper.unmount()
    expect(palco.stop).toHaveBeenCalled()
  })

  it('módulos sem desenho independente (obs=false) ignoram conexões e TVs', async () => {
    obsAssignments.value = { '47082': 'bible' }
    tvAssignments.value = { a: 'bible' }
    const wrapper = await mountStatus({ obs: false })
    expect(wrapper.find('.independent-status').exists()).toBe(false)
  })

  it('Encerrar tira o módulo de monitores, conexões e TVs', async () => {
    activeMonitorIds.value = [2]
    activeMode.value = 'share'
    obsAssignments.value = { '47082': 'bible', '0': 'clock' }
    tvAssignments.value = { a: 'bible' }
    const wrapper = await mountStatus()
    await wrapper.get('[data-testid="independent-projection-status-stop"]').trigger('click')
    await flushPromises()
    expect(stop).toHaveBeenCalled()
    expect(obsAssignments.value).toEqual({ '0': 'clock' })
    expect(tvAssignments.value).toEqual({})
    expect(wrapper.find('.independent-status').exists()).toBe(false)
  })
})
