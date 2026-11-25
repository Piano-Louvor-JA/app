import { describe, expect, it, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import LibrasPlayer from '../components/LibrasPlayer.vue'

vi.mock('../composables/useLibrasLyrics', () => {
  const state = ref<'disabled' | 'loading' | 'ready' | 'unavailable'>('disabled')
  const gloss = ref<string | null>(null)
  const useLibrasLyrics = vi.fn(() => ({ state, gloss, enabled: ref(true) }))
  return { useLibrasLyrics, __refs: { state, gloss } }
})

import { __refs } from '../composables/useLibrasLyrics'

const refs = __refs as { state: { value: string }, gloss: { value: string | null } }

async function mountPlayer(): Promise<VueWrapper> {
  return mount(LibrasPlayer, {
    props: { lyrics: 'Letra de teste' },
  })
}

describe('LibrasPlayer.vue', () => {
  it('estado disabled: nada renderiza', async () => {
    refs.state.value = 'disabled'
    refs.gloss.value = null
    const wrapper = await mountPlayer()
    expect(wrapper.find('[data-testid="libras-player"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('estado loading: nada renderiza (sem spinner bloqueante)', async () => {
    refs.state.value = 'loading'
    refs.gloss.value = null
    const wrapper = await mountPlayer()
    expect(wrapper.find('[data-testid="libras-player"]').exists()).toBe(false)
  })

  it('estado ready: gloss textual visível', async () => {
    refs.state.value = 'ready'
    refs.gloss.value = 'H I N O _ S A N T O'
    const wrapper = await mountPlayer()
    expect(wrapper.find('[data-testid="libras-player"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="libras-gloss"]').text()).toContain('H I N O _ S A N T O')
  })

  it('estado unavailable: nada renderiza (degradação silenciosa)', async () => {
    refs.state.value = 'unavailable'
    refs.gloss.value = null
    const wrapper = await mountPlayer()
    expect(wrapper.find('[data-testid="libras-player"]').exists()).toBe(false)
  })

  it('declara tradução automática (não substitui original)', async () => {
    refs.state.value = 'ready'
    refs.gloss.value = 'A'
    const wrapper = await mountPlayer()
    expect(wrapper.find('[data-testid="libras-auto-notice"]').exists()).toBe(true)
  })

  it('acessível: role region + aria-label', async () => {
    refs.state.value = 'ready'
    refs.gloss.value = 'A'
    const wrapper = await mountPlayer()
    const root = wrapper.find('[data-testid="libras-player"]')
    expect(root.attributes('role')).toBe('region')
    expect(root.attributes('aria-label')).toBeTruthy()
  })
})