// File: src/modules/media/__tests__/media-projection-libras-off.test.ts
// HOTFIX (grupo reportou): libras.enabled desativado, avatar CONTINUAVA na projeção.
// Causa: :visible="runtime.active" ignorava isLibrasEnabled() (lido 1x e nunca usado).
// Regressão: projeção ativa + Libras OFF => player oculto; storage event de
// user_data reavalia (desligar na janela de settings esconde na projeção).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../services/libras-translate', () => ({ getLibrasGloss: vi.fn(async () => ({ gloss: '' })) }))
vi.mock('../../libras/services/libras-trie', () => ({
  prepareGlossForPlayback: vi.fn(async () => null),
}))
vi.mock('../../libras/components/VLibrasUnityPlayer.vue', () => ({
  default: {
    name: 'VLibrasUnityPlayer',
    props: ['compact', 'visible', 'avatar', 'subtitle', 'speed'],
    emits: [],
    template: `<div data-testid="vlibras-unity-player" :class="{ 'vlibras-hidden': visible === false }" />`,
    methods: { playGloss: vi.fn(), stop: vi.fn() },
  },
}))
import MediaProjectionView from '../views/MediaProjectionView.vue'

const PREFS = 'user_data'

function setPrefs(prefs: Record<string, unknown>) {
  localStorage.setItem(PREFS, JSON.stringify(prefs))
}
function setActiveRuntime() {
  localStorage.setItem('louvorja-media-runtime-state', JSON.stringify({ active: true }))
}
function storageEvent(key: string) {
  window.dispatchEvent(new StorageEvent('storage', { key }))
}

beforeEach(() => {
  localStorage.clear()
  setActiveRuntime()
})
afterEach(() => {
  localStorage.clear()
})

describe('HOTFIX — Libras OFF na projeção', () => {
  it('projeção ativa + libras.enabled=false => player oculto', async () => {
    setPrefs({ 'libras.enabled': false })
    const w = mount(MediaProjectionView)
    await flushPromises()
    const player = w.find('[data-testid="vlibras-unity-player"]')
    expect(player.exists()).toBe(true)
    expect(player.classes()).toContain('vlibras-hidden')
    w.unmount()
  })

  it('desligar libras depois (storage event) esconde o player', async () => {
    setPrefs({ 'libras.enabled': true })
    const w = mount(MediaProjectionView)
    await flushPromises()
    const player = w.find('[data-testid="vlibras-unity-player"]')
    expect(player.classes()).not.toContain('vlibras-hidden')
    setPrefs({ 'libras.enabled': false })
    storageEvent(PREFS)
    await flushPromises()
    expect(player.classes()).toContain('vlibras-hidden')
    w.unmount()
  })

  it('desligar libras em outra janela Electron (BroadcastChannel) esconde o player', async () => {
    setPrefs({ 'libras.enabled': true })
    const w = mount(MediaProjectionView)
    await flushPromises()
    const player = w.find('[data-testid="vlibras-unity-player"]')
    setPrefs({ 'libras.enabled': false })
    const ch = new BroadcastChannel('louvorja-user-prefs')
    ch.postMessage({ key: 'libras.enabled' })
    await flushPromises()
    ch.close()
    expect(player.classes()).toContain('vlibras-hidden')
    w.unmount()
  })
})
