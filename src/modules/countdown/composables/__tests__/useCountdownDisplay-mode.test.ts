// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('../../services/alert-tone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/alert-tone')>()),
  clearAlertQueue: vi.fn(),
  enqueueAlert: vi.fn(),
  playAlertTone: vi.fn(() => Promise.resolve()),
  setLiveVolume: vi.fn(),
  stopAllAlerts: vi.fn(),
}))

vi.mock('../../services/audio-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/audio-control')>()),
  claimAudioHost: vi.fn(() => true),
  isOperatorWindow: vi.fn(() => true),
  releaseAudioHost: vi.fn(),
}))

import { useCountdownDisplay } from '../useCountdown'
import { useCountdownStore } from '../../stores/useCountdownStore'
import { clearAlertQueue, enqueueAlert, stopAllAlerts } from '../../services/alert-tone'

function mountDisplay() {
  return mount(
    defineComponent({
      setup() {
        useCountdownDisplay()
        return () => h('div')
      },
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCountdownDisplay — alertas só no modo Escola Sabatina', () => {
  it('modo padrão: iniciar NÃO toca o alerta de abertura', async () => {
    const store = useCountdownStore()
    store.setMode('standard')
    store.setDurationMs(600_000)
    const wrapper = mountDisplay()

    store.start()
    await nextTick()

    expect(enqueueAlert).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('modo Escola Sabatina: iniciar toca o alerta de abertura', async () => {
    const store = useCountdownStore()
    store.setMode('sabbath')
    store.setDurationMs(600_000)
    const wrapper = mountDisplay()

    store.start()
    await nextTick()

    expect(enqueueAlert).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('sair do modo Escola Sabatina corta o que estiver tocando', async () => {
    const store = useCountdownStore()
    store.setMode('sabbath')
    const wrapper = mountDisplay()

    store.setMode('standard')
    await nextTick()

    expect(stopAllAlerts).toHaveBeenCalled()
    expect(clearAlertQueue).toHaveBeenCalled()
    wrapper.unmount()
  })
})
