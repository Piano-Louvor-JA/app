// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) =>
      params ? `${k}:${JSON.stringify(params)}` : k,
    locale: { value: 'pt-BR' },
  }),
}))

import ExternalPlayerCard from '../ExternalPlayerCard.vue'

const originalLouvorja = window.louvorja

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'louvorja', {
    value: bridge,
    configurable: true,
    writable: true,
  })
}

function makeBridge() {
  return {
    isElectron: true,
    externalPlayer: {
      get: vi.fn().mockResolvedValue('associated'),
      set: vi.fn().mockResolvedValue(true),
      detect: vi.fn().mockResolvedValue([{ id: 'vlc', name: 'VLC', path: '/usr/bin/vlc' }]),
      listCustom: vi.fn().mockResolvedValue([]),
      removeCustom: vi.fn().mockResolvedValue(null),
    },
    dialog: {
      openFile: vi.fn().mockResolvedValue('/opt/player.exe'),
    },
  }
}

async function mountCard() {
  const w = mount(ExternalPlayerCard)
  await flushPromises()
  return w
}

describe('ExternalPlayerCard', () => {
  let active: ReturnType<typeof mount> | null = null
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    active?.unmount()
    active = null
    setBridge(originalLouvorja)
  })

  it('sem bridge: mostra aviso desktopOnly e sem controles', async () => {
    setBridge(undefined)
    const w = await mountCard()
    active = w
    expect(w.text()).toContain('settings.externalPlayer.title')
    expect(w.find('[data-test="external-player-associated"]').exists()).toBe(false)
  })

  it('carrega preferência e players detectados', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(bridge.externalPlayer.get).toHaveBeenCalled()
    expect(bridge.externalPlayer.detect).toHaveBeenCalled()
    expect(w.find('[data-test="external-player-vlc"]').exists()).toBe(true)
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('true')
  })

  it('get() com falha cai no padrão associated', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('true')
  })

  it('detect() com falha mantém lista vazia e scanned=true', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.text()).not.toContain('VLC')
  })

  it('listCustom com falha e preferência custom: preserva player da preferência', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('custom:/opt/mpv')
    bridge.externalPlayer.listCustom.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.text()).toContain('mpv')
  })

  it('setPlayer com sucesso atualiza e recarrega custom players', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="external-player-associated"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('associated')
  })

  it('setPlayer com set()=false reverte para o anterior', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.externalPlayer.get.mockResolvedValue('vlc-id')
    setBridge(bridge)
    const w = await mountCard()
    active = w
    bridge.externalPlayer.set.mockResolvedValue(false)
    await w.find('[data-test="external-player-associated"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('false')
  })

  it('setPlayer com exceção reverte para o anterior', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.externalPlayer.get.mockResolvedValue('vlc-id')
    bridge.externalPlayer.set.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="external-player-associated"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('false')
  })

  it('detectar de novo via botão re-executa detect()', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(bridge.externalPlayer.detect).toHaveBeenCalledTimes(1)
    await w.find('[data-test="external-player-detect"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.detect).toHaveBeenCalledTimes(2)
  })

  it('pickCustomPlayer: arquivo escolhido vira custom player selecionado', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.dialog.openFile).toHaveBeenCalled()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('custom:/opt/player.exe')
    expect(w.text()).toContain('player.exe')
  })

  it('pickCustomPlayer: caminho em array é aceito; cancelar não seta', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    setBridge(bridge)
    const w = await mountCard()
    active = w
    bridge.dialog.openFile.mockResolvedValue(['/arr/path.bin'])
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('custom:/arr/path.bin')
    bridge.dialog.openFile.mockResolvedValue(null)
    const calls = bridge.externalPlayer.set.mock.calls.length
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledTimes(calls)
  })

  it('pickCustomPlayer com exceção do dialog é ignorado', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.dialog.openFile.mockRejectedValue(new Error('cancel'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).not.toHaveBeenCalled()
  })

  it('removeCustom com resultado do bridge aplica player+lista retornados', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('custom:/opt/mpv')
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    bridge.externalPlayer.removeCustom.mockResolvedValue({
      player: 'associated',
      customPlayers: [],
    })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const removeBtn = w.find('[data-test="external-player-custom-remove"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn!.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.removeCustom).toHaveBeenCalledWith('/opt/mpv')
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('true')
  })

  it('removeCustom sem resultado: remove da lista e volta para associated se era o selecionado', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('custom:/opt/mpv')
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    bridge.externalPlayer.removeCustom.mockResolvedValue(undefined)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const removeBtn = w.find('[data-test="external-player-custom-remove"]')
    await removeBtn.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('associated')
    expect(w.find('[data-test="external-player-associated"]').attributes('aria-checked')).toBe('true')
  })
})
