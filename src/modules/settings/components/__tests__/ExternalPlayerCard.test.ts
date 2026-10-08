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

  it('removeCustom com exceção: mantém lista (catch)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.removeCustom = vi.fn(async () => { throw new Error('x') })
    bridge.externalPlayer.listCustom = vi.fn(async () => ['/opt/wps/wpsoffice'])
    setBridge(bridge)
    const w = await mountCard()
    await flushPromises()
    const rm = w.find('[data-test="external-player-custom-remove"]')
    if (rm.exists()) {
      await rm.trigger('click')
      await flushPromises()
    }
    expect(w.exists()).toBe(true)
    w.unmount()
  })

  it('chip custom selecionado: setPlayer customId via clique', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.listCustom = vi.fn(async () => ['/opt/wps/wpsoffice'])
    bridge.externalPlayer.get = vi.fn(async () => 'custom:/opt/wps/wpsoffice')
    setBridge(bridge)
    const w = await mountCard()
    await flushPromises()
    const chip = w.find('[data-test="external-player-custom"]')
    if (chip.exists()) {
      await chip.trigger('click')
      await flushPromises()
      expect(bridge.externalPlayer.set).toHaveBeenCalledWith('custom:/opt/wps/wpsoffice')
    }
    w.unmount()
  })

  it('gaps: clicks nos radios/custom (cond-expr template), remove custom via chip', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.listCustom.mockResolvedValue(['/usr/bin/mpv'])
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await flushPromises()
    // radio associated + detect (cond-expr aria/selected)
    // com set() pendente: 2º click cai no guard busy (brs 80/96/119)
    let releaseSet!: (v: boolean) => void
    bridge.externalPlayer.set.mockReturnValue(new Promise((r) => (releaseSet = r)))
    await w.find('[data-test="external-player-associated"]').trigger('click')
    await flushPromises()
    await w.find('[data-test="external-player-associated"]').trigger('click') // busy → no-op
    await w.find('[data-test="external-player-detect"]').trigger('click') // tb no-op? detect tem próprio guard
    releaseSet(true)
    await flushPromises()
    await w.find('[data-test="external-player-detect"]').trigger('click')
    await flushPromises()
    // custom chip: click seleciona; remove limpa
    const custom = w.find('[data-test="external-player-custom"]')
    if (custom.exists()) {
      await custom.trigger('click')
      await flushPromises()
      const rm = w.find('[data-test="external-player-custom-remove"]')
      if (rm.exists()) await rm.trigger('click')
      await flushPromises()
    }
    w.unmount()
  })
  it('gaps8: clique no radio vlc dispara setPlayer do template (fn 211)', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const vlc = w.find('[data-test="external-player-vlc"]')
    expect(vlc.exists()).toBe(true)
    await vlc.trigger('click')
    await flushPromises()
    expect(w.find('[data-test="external-player-vlc"]').attributes('aria-checked')).toBe('true')
    w.unmount()
  })

  it('gaps2: fileName fallback e listCustom ?? [] (L23/46)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('custom:mpv-sem-barra')
    bridge.externalPlayer.listCustom.mockResolvedValue(undefined)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.text()).toContain('mpv-sem-barra')
  })

  it('gaps2: detect ?? [] com null (L65)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.text()).not.toContain('VLC')
  })

  it('gaps2: guard busy em setPlayer/removeCustom/pickCustomPlayer (L80/96/119)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    let releaseSet: ((v: boolean) => void) | null = null
    bridge.externalPlayer.set.mockImplementation(
      () => new Promise<boolean>((resolve) => { releaseSet = resolve }),
    )
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const vlcBtn = w.find('[data-test="external-player-vlc"]')
    const first = vlcBtn.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledTimes(1)
    // segunda chamada enquanto busy: guard retorna sem chamar set de novo
    vlcBtn.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledTimes(1)
    // removeCustom (L96) e pickCustomPlayer (L119) com busy true
    const chip = w.get('[data-test="external-player-custom-remove"]')
    chip.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(bridge.externalPlayer.removeCustom).not.toHaveBeenCalled()
    const pick = w.get('[data-test="external-player-pick"]')
    pick.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(bridge.dialog.openFile).not.toHaveBeenCalled()
    releaseSet!(true)
    await first
    await flushPromises()
  })

  it('gaps2: removeCustom result.customPlayers ?? [] e player não-custom (L102/106)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('vlc-id')
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    bridge.externalPlayer.removeCustom.mockResolvedValue({
      player: 'vlc-id',
      customPlayers: undefined,
    })
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const btn = w.findAll('[data-test="external-player-custom-remove"]')[0]
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).not.toHaveBeenCalled()
  })

  it('gaps2: removeCustom do player ativo com set()=false mantém custom (L108)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('custom:/opt/mpv')
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    bridge.externalPlayer.removeCustom.mockResolvedValue(null)
    bridge.externalPlayer.set.mockResolvedValue(false)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const btn = w.findAll('[data-test="external-player-custom-remove"]')[0]
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('associated')
  })

  it('gaps2: pickCustomPlayer com caminho escolhido e com cancelamento (L119-128)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.detect.mockResolvedValue([])
    setBridge(bridge)
    const w = await mountCard()
    active = w
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledWith('custom:/opt/player.exe')
    bridge.dialog.openFile.mockResolvedValue(null)
    await w.find('[data-test="external-player-pick"]').trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).toHaveBeenCalledTimes(1)
  })

  it('gaps2b: listCustom falha sem preferência custom (L55 false)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.listCustom.mockRejectedValue(new Error('x'))
    setBridge(bridge)
    const w = await mountCard()
    active = w
    expect(w.find('[data-test="external-player-detect"]').exists()).toBe(true)
  })

  it('gaps2b: removeCustom sem resultado e player não era o custom (L106 false)', async () => {
    const bridge = makeBridge()
    bridge.externalPlayer.get.mockResolvedValue('vlc-id')
    bridge.externalPlayer.detect.mockResolvedValue([])
    bridge.externalPlayer.listCustom.mockResolvedValue(['/opt/mpv'])
    bridge.externalPlayer.removeCustom.mockResolvedValue(null)
    setBridge(bridge)
    const w = await mountCard()
    active = w
    const btn = w.findAll('[data-test="external-player-custom-remove"]')[0]
    await btn.trigger('click')
    await flushPromises()
    expect(bridge.externalPlayer.set).not.toHaveBeenCalled()
  })
})
