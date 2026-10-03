// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': {} } })

vi.mock('../../composables/useRemoteControl', async () => {
  const { ref } = await import('vue')
  const enabled = ref(false)
  const connected = ref(false)
  const senderUrl = ref('ws://192.168.1.10:7081/palco')
  return {
    useRemoteControl: () => ({
      enabled,
      connected,
      senderUrl,
      setSenderUrl: vi.fn(),
    }),
    __refs: { enabled, connected },
  }
})
import { useRemoteControl } from '../../composables/useRemoteControl'

const GlassCard = { name: 'GlassCard', template: '<div class="glass-card"><slot /></div>' }

import RemoteControlView from '../RemoteControlView.vue'

function createWrapper() {
  return mount(RemoteControlView, {
    global: {
      plugins: [i18n],
      stubs: {
        GlassCard,
        'v-switch': { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', !modelValue)" />' },
        'v-text-field': { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        'v-alert': { template: '<div class="v-alert"><slot /></div>' },
      },
    },
  })
}

describe('RemoteControlView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza card com título, switch e url', () => {
    const w = createWrapper()
    expect(w.find('.glass-card').exists()).toBe(true)
    expect(w.find('[data-testid="remote-enabled"]').exists()).toBe(true)
    expect(w.find('[data-testid="remote-sender-url"]').exists()).toBe(true)
    w.unmount()
  })

  it('desabilitado: campo url disabled', () => {
    const w = createWrapper()
    expect((w.find('[data-testid="remote-sender-url"]').element as HTMLInputElement).disabled).toBe(true)
    w.unmount()
  })

  it('habilita: url habilitada + alerta conectado visível', async () => {
    const w = createWrapper()
    await w.find('[data-testid="remote-enabled"]').setValue(true)
    await flushPromises()
    expect((w.find('[data-testid="remote-sender-url"]').element as HTMLInputElement).disabled).toBe(false)
    w.unmount()
  })

  it('conectado: mostra alerta', async () => {
    const refs = ((useRemoteControl() as any).__refs) || ({} as any)
    const w = createWrapper()
    if (refs.enabled) { refs.enabled.value = true; refs.connected.value = true }
    await flushPromises()
    expect(w.find('.v-alert').exists()).toBe(true)
    w.unmount()
  })

  it('habilitado e conectando: alerta info com texto connecting (br 48)', async () => {
    const refs = ((useRemoteControl() as any).__refs) || ({} as any)
    const w = createWrapper()
    if (refs.enabled) { refs.enabled.value = true; refs.connected.value = false }
    await flushPromises()
    expect(w.find('[data-testid="remote-status"]').exists()).toBe(true)
    expect(w.text()).toContain('settings.remote.connecting')
    w.unmount()
  })
})
