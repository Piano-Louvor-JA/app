// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const palco = vi.hoisted(() => ({
  status: vi.fn(),
  turnOn: vi.fn(),
  turnOff: vi.fn(),
}))

vi.mock('@modules/settings/services/palco-session', () => ({
  palcoSession: palco,
}))

import ObsView from '../ObsView.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      utilities: {
        obs: 'Transmitir via OBS',
        obsLead: 'lead',
        obsTransmission: 'Transmissão',
        obsOn: 'No ar — {n} viewer(s)',
        obsOff: 'Desligada',
        obsStart: 'Iniciar transmissão',
        obsStop: 'Encerrar',
        obsUrlLabel: 'URL do Browser Source',
        obsCopy: 'Copiar URL',
        obsCopied: 'Copiada!',
        obsHowTitle: 'No OBS (uma vez só):',
        obsStep1: 'passo 1',
        obsStep2: 'passo 2',
        obsStep3: 'passo 3',
      },
    },
  },
})

function mountView() {
  return mount(ObsView, {
    global: {
      plugins: [i18n],
      mocks: { $router: { back: vi.fn() } },
    },
  })
}

describe('ObsView', () => {
  beforeEach(() => {
    palco.status.mockReset()
    palco.turnOn.mockReset()
    palco.turnOff.mockReset()
    palco.turnOn.mockResolvedValue(true)
    palco.turnOff.mockResolvedValue(undefined)
  })

  it('mostra a transmissão desligada e, ao ligar, a URL do Browser Source', async () => {
    palco.status
      .mockResolvedValueOnce({
        running: false,
        clients: 0,
        receiverUrl: null,
      })
      .mockResolvedValueOnce({
        running: true,
        clients: 2,
        receiverUrl: 'http://10.0.0.8:7080/?token=abc',
      })

    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('Desligada')
    expect(w.find('.obs-view__url').exists()).toBe(false)

    await w.get('.obs-view__toggle').trigger('click')
    await flushPromises()

    expect(palco.turnOn).toHaveBeenCalledOnce()
    expect(w.text()).toContain('No ar — 2 viewer(s)')
    expect(w.find('.obs-view__url').text()).toBe(
      'http://10.0.0.8:7080/?token=abc',
    )
    expect(w.findAll('.obs-view__steps li')).toHaveLength(3)
    w.unmount()
  })

  it('copia a URL e encerra a transmissão', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    palco.status
      .mockResolvedValueOnce({
        running: true,
        clients: 1,
        receiverUrl: 'http://10.0.0.8:7080/?token=abc',
      })
      .mockResolvedValueOnce({
        running: false,
        clients: 0,
        receiverUrl: null,
      })

    const w = mountView()
    await flushPromises()
    await w.get('.obs-view__copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith('http://10.0.0.8:7080/?token=abc')
    expect(w.text()).toContain('Copiada!')

    await w.get('.obs-view__toggle').trigger('click')
    await flushPromises()
    expect(palco.turnOff).toHaveBeenCalledOnce()
    expect(w.text()).toContain('Desligada')
    w.unmount()
  })
})
