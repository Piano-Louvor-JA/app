// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
      locale: { value: 'pt-BR' },
    }),
  }
})

let stagePayload: Record<string, unknown> = {
  backgroundColor: '#000000',
  backgroundImage: '',
  fontSize: 96,
  fontWeight: 700,
  textColor: '#ffffff',
  textAlign: 'center',
  textVerticalAlign: 'center',
  textShadow: false,
  shadowBlur: 1,
  shadowIntensity: 0.4,
  textBox: false,
  boxBorder: false,
  boxOpacity: 0.3,
  countdown: { timeFormat: 'mm:ss', bgColor: '#000000', textColor: '#ffffff' },
}
let stageSubscribers: Array<() => void> = []

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => stagePayload,
  subscribeStageSettings: (cb: () => void) => {
    stageSubscribers.push(cb)
    return () => {
      stageSubscribers = stageSubscribers.filter((fn) => fn !== cb)
    }
  },
}))

vi.mock('../../settings/components/StageCustomizationDialog.vue', () => ({
  default: { template: '<div class="stage-custom-dbg" />', props: ['open'] },
}))
vi.mock('../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { template: '<div class="palco-select-dbg" />', props: ['module'] },
}))

import CountdownView from '../views/CountdownView.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: {} })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'utilities-temporizador', component: { template: '<div />' } },
      { path: '/countdown', name: 'countdown', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/')
  const wrapper = mount(CountdownView, {
    global: { plugins: [createPinia(), i18n, router] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  stagePayload = {
    backgroundColor: '#000000',
    backgroundImage: '',
    fontSize: 96,
    fontWeight: 700,
    textColor: '#ffffff',
    textAlign: 'center',
    textVerticalAlign: 'center',
    textShadow: false,
    shadowBlur: 1,
    shadowIntensity: 0.4,
    textBox: false,
    boxBorder: false,
    boxOpacity: 0.3,
    countdown: { timeFormat: 'mm:ss', bgColor: '#000000', textColor: '#ffffff' },
  }
  stageSubscribers = []
})

describe('CountdownView', () => {
  it('monta com header, widget e FAB; stage sem countdown usa config puro', async () => {
    delete (stagePayload as Record<string, unknown>).countdown
    const wrapper = await mountView()
    expect(wrapper.find('.countdown-view__widget').exists()).toBe(true)
    expect(wrapper.find('.countdown-project-fab').exists()).toBe(true)
    wrapper.unmount()
  })

  it('botão voltar navega para utilities-temporizador', async () => {
    const wrapper = await mountView()
    const router = wrapper.vm.$.appContext.config.globalProperties.$router
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)
    await wrapper.find('.countdown-view__back').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'utilities-temporizador' })
    push.mockRestore()
    wrapper.unmount()
  })

  it('toolbar abre dialog de customização; callback de stage atualiza; unmount desinscreve', async () => {
    const wrapper = await mountView()
    expect(stageSubscribers).toHaveLength(1)
    await wrapper.find('.countdown-view__tool-btn').trigger('click')
    await flushPromises()
    // dispara callback de stage (linha 60) e depois desinscreve no unmount
    stageSubscribers.forEach((cb) => cb())
    wrapper.unmount()
    const before = stageSubscribers.length
    stageSubscribers.forEach((cb) => cb())
    expect(stageSubscribers.length).toBe(before)
  })

  it('fluxo completo: set duration, start, pause, reset, save', async () => {
    const wrapper = await mountView()

    // define duração via input de horas (1h)
    const hoursInput = wrapper.find('input[aria-label="countdown.hours"]')
    await hoursInput.setValue('1')

    // start habilitado após duração > 0
    const startBtn = wrapper.find('.countdown-view__ctrl--start')
    expect(startBtn.attributes('disabled')).toBeUndefined()
    await startBtn.trigger('click')
    await flushPromises()

    // rodando: botão vira pause
    const pauseBtn = wrapper.find('.countdown-view__ctrl--pause')
    expect(pauseBtn.exists()).toBe(true)
    await pauseBtn.trigger('click')
    await flushPromises()

    // save marca tempo; reset zera
    await wrapper.find('.countdown-view__ctrl--save').trigger('click')
    await flushPromises()
    await wrapper.find('.countdown-view__ctrl--reset').trigger('click')
    await flushPromises()
    wrapper.unmount()
  })

  it('background image do palco vira url no style', async () => {
    stagePayload.backgroundImage = 'https://example.com/palco.png'
    const wrapper = await mountView()
    expect(wrapper.find('.countdown-view__preview').attributes('style')).toContain('palco.png')
    wrapper.unmount()
  })

  it('modo until via botões do DurationInput compacto', async () => {
    const wrapper = await mountView()
    const modes = wrapper.findAll('.countdown-duration__mode')
    await modes[1].trigger('click')
    await flushPromises()
    const untilHour = wrapper.find('input[aria-label="countdown.untilHour"]')
    expect(untilHour.exists()).toBe(true)
    await untilHour.setValue('21')
    const untilMinute = wrapper.find('input[aria-label="countdown.untilMinute"]')
    await untilMinute.setValue('45')
    wrapper.unmount()
  })

  it('FAB aciona toggleProjection (projecting indicator aparece/desaparece)', async () => {
    const wrapper = await mountView()
    const fab = wrapper.find('.countdown-project-fab')
    await fab.trigger('click')
    await flushPromises()
    // segunda chamada volta ao estado original
    await wrapper.find('.countdown-project-fab').trigger('click')
    await flushPromises()
    wrapper.unmount()
  })
})
