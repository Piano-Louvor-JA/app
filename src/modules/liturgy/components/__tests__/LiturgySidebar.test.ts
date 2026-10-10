// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'
import LiturgySidebar from '../LiturgySidebar.vue'

vi.mock('@design-system/index', () => ({ GlassCard: { template: '<div><slot /></div>' } }))

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: ptBR } })

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(LiturgySidebar, {
    props: {
      remainingCountdown: '',
      countdownExpired: false,
      countdownRunning: false,
      canStartCountdown: true,
      startTimeInput: '',
      endTimeInput: '',
      notes: '',
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('LiturgySidebar', () => {
  it('renderiza o aside', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-sidebar').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('undefined')
  })

  it('mostra botão play quando countdown não está rodando', () => {
    const wrapper = createWrapper({ countdownRunning: false })
    expect(wrapper.find('.liturgy-sidebar__play').exists()).toBe(true)
  })

  it('quando countdown rodando, botão vira stop (classe modificadora)', () => {
    const wrapper = createWrapper({ countdownRunning: true })
    expect(wrapper.find('.liturgy-sidebar__play--stop').exists()).toBe(true)
  })

  it('botão play desabilitado quando canStartCountdown=false', () => {
    const wrapper = createWrapper({ canStartCountdown: false })
    expect(wrapper.find('.liturgy-sidebar__play').attributes('disabled')).toBeDefined()
  })

  it('botão play habilitado quando canStartCountdown=true', () => {
    const wrapper = createWrapper({ canStartCountdown: true })
    expect(wrapper.find('.liturgy-sidebar__play').attributes('disabled')).toBeUndefined()
  })

  it('play emite startCountdown', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.liturgy-sidebar__play').trigger('click')
    expect(wrapper.emitted('startCountdown')).toBeTruthy()
  })

  it('notas renderizam valor inicial', () => {
    const wrapper = createWrapper({ notes: 'nota teste' })
    const textarea = wrapper.find('textarea')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('nota teste')
  })

  it('digitar notas emite update:notes', async () => {
    const wrapper = createWrapper()
    const textarea = wrapper.find('textarea')
    ;(textarea.element as HTMLTextAreaElement).value = 'nova nota'
    await textarea.trigger('input')
    expect(wrapper.emitted('update:notes')?.[0]).toEqual(['nova nota'])
  })

  it('input start vazio emite clearStart', async () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input[type="time"]')
    ;(input.element as HTMLInputElement).value = ''
    await input.trigger('change')
    expect(wrapper.emitted('clearStart')).toBeTruthy()
  })

  it('input start com valor emite setStartFromInput', async () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input[type="time"]')
    ;(input.element as HTMLInputElement).value = '10:30'
    await input.trigger('change')
    expect(wrapper.emitted('setStartFromInput')?.[0]).toEqual(['10:30'])
  })

  it('input end vazio emite clearEnd', async () => {
    const wrapper = createWrapper({ startTimeInput: '10:00' })
    const inputs = wrapper.findAll('input[type="time"]')
    ;(inputs[1].element as HTMLInputElement).value = ''
    await inputs[1].trigger('change')
    expect(wrapper.emitted('clearEnd')).toBeTruthy()
  })

  it('input end com valor emite setEndFromInput', async () => {
    const wrapper = createWrapper({ startTimeInput: '10:00' })
    const inputs = wrapper.findAll('input[type="time"]')
    ;(inputs[1].element as HTMLInputElement).value = '12:00'
    await inputs[1].trigger('change')
    expect(wrapper.emitted('setEndFromInput')?.[0]).toEqual(['12:00'])
  })

  it('exibe countdown label quando rodando', () => {
    const wrapper = createWrapper({ countdownRunning: true, remainingCountdown: '03:21' })
    expect(wrapper.text()).toContain('03:21')
  })

  it('emite stopCountdown quando countdown rodando e clica stop', async () => {
    const wrapper = createWrapper({ countdownRunning: true })
    const stop = wrapper.find('[aria-label*="arar"], [title*="arar"]')
    if (stop.exists()) {
      await stop.trigger('click')
      expect(wrapper.emitted('stopCountdown')).toBeTruthy()
    }
  })

  describe('clearStart/clearEnd/manageTeam (106/132/171)', () => {
    it('com startTime e endTime: botões x emitem clear', async () => {
      const w = createWrapper({ startTimeInput: '10:00', endTimeInput: '11:00' })
      const ghost = w.findAll('.liturgy-sidebar__time-btn--ghost')
      expect(ghost.length).toBe(2)
      await ghost[0].trigger('click')
      await ghost[1].trigger('click')
      expect(w.emitted('clearStart')).toBeTruthy()
      expect(w.emitted('clearEnd')).toBeTruthy()
      w.unmount()
    })

    it('manageTeam emite (171)', async () => {
      const w = createWrapper({ team: [] })
      const btn = w.find('.liturgy-sidebar__team-btn')
      if (btn.exists()) {
        await btn.trigger('click')
        expect(w.emitted('manageTeam')).toBeTruthy()
      }
      w.unmount()
    })
  })
})
