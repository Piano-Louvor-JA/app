// @vitest-environment jsdom
// useExternalPlayerChoices — labels, push dedupe, load com bridge, selected/stored id
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}))

import { useExternalPlayerChoices } from '../useExternalPlayerChoices'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        externalPlayer: {
          player: {
            associated: 'Associado ao sistema',
            custom: 'Personalizado: {name}',
          },
        },
      },
    },
  },
})

function setup(bridge: unknown) {
  mocks.getDesktopBridge.mockReturnValue(bridge)
  const host = defineComponent({
    setup() {
      return () => h('div')
    },
  })
  const app = createApp(host)
  app.use(i18n)
  let result!: ReturnType<typeof useExternalPlayerChoices>
  const comp = defineComponent({
    setup() {
      result = useExternalPlayerChoices()
      return () => h('div')
    },
  })
  app.use(createPinia())
  app.mount(document.createElement('div'))
  const compApp = createApp(comp)
  compApp.use(i18n)
  compApp.mount(document.createElement('div'))
  void host
  return { result, app }
}

import { defineComponent, h, createApp } from 'vue'
import { createPinia } from 'pinia'

describe('useExternalPlayerChoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sem bridge: retorna cedo, options vazias', async () => {
    mocks.getDesktopBridge.mockReturnValue(null)
    const { result } = setup(null)
    await result.loadPlayerChoices()
    expect(result.playerOptions.value).toEqual([])
    expect(result.globalPlayer.value).toBe('associated')
  })

  it('bridge completo: associated + detected + customs, sem duplicar', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => [{ id: 'vlc', label: 'VLC Media Player' }]),
        listCustom: vi.fn(async () => ['/usr/bin/mpv']),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => [{ id: 'vlc', label: 'VLC Media Player' }]),
        listCustom: vi.fn(async () => ['/usr/bin/mpv']),
      },
    })
    await result.loadPlayerChoices()
    const ids = result.playerOptions.value.map((o) => o.id)
    expect(ids).toContain('associated')
    expect(ids).toContain('vlc')
    expect(ids).toContain('custom:/usr/bin/mpv')
    // vlc não duplica (global = vlc)
    expect(ids.filter((i) => i === 'vlc').length).toBe(1)
    expect(result.globalPlayer.value).toBe('vlc')
  })

  it('custom id: label com nome do arquivo', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'custom:/opt/wps/app'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => ['/opt/wps/app']),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'custom:/opt/wps/app'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => ['/opt/wps/app']),
      },
    })
    await result.loadPlayerChoices()
    const custom = result.playerOptions.value.find((o) => o.id.startsWith('custom:'))
    expect(custom!.label).toContain('app')
  })

  it('get falha: fallback associated', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => { throw new Error('x') }),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => { throw new Error('x') }),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    await result.loadPlayerChoices()
    expect(result.globalPlayer.value).toBe('associated')
  })

  it('detect/listCustom falham: seguem com listas vazias', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'associated'),
        detect: vi.fn(async () => { throw new Error('x') }),
        listCustom: vi.fn(async () => { throw new Error('x') }),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'associated'),
        detect: vi.fn(async () => { throw new Error('x') }),
        listCustom: vi.fn(async () => { throw new Error('x') }),
      },
    })
    await result.loadPlayerChoices()
    expect(result.playerOptions.value.map((o) => o.id)).toEqual(['associated'])
  })

  it('extraIds entram como opções (default ignorado)', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'associated'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'associated'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    await result.loadPlayerChoices(['vlc', 'default', undefined])
    const ids = result.playerOptions.value.map((o) => o.id)
    expect(ids).toContain('vlc')
    expect(ids).not.toContain('default')
  })

  it('selectedPlayerId: default→global; explícito mantém', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    await result.loadPlayerChoices()
    expect(result.selectedPlayerId(undefined)).toBe('vlc')
    expect(result.selectedPlayerId('default')).toBe('vlc')
    expect(result.selectedPlayerId('mpv')).toBe('mpv')
  })

  it('storedPlayerId: igual ao global → default; diferente mantém', async () => {
    mocks.getDesktopBridge.mockReturnValue({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    const { result } = setup({
      externalPlayer: {
        get: vi.fn(async () => 'vlc'),
        detect: vi.fn(async () => []),
        listCustom: vi.fn(async () => []),
      },
    })
    await result.loadPlayerChoices()
    expect(result.storedPlayerId('vlc')).toBe('default')
    expect(result.storedPlayerId('mpv')).toBe('mpv')
  })
  describe('gaps — fileName edge e get undefined', () => {
    it('custom bin terminando em separador: label é o caminho cru', async () => {
      const { result } = setup({
        externalPlayer: {
          get: vi.fn(async () => 'custom:/opt/wps/'),
          detect: vi.fn(async () => []),
          listCustom: vi.fn(async () => ['/opt/wps/']),
        },
      })
      await result.loadPlayerChoices()
      const custom = result.playerOptions.value.find((o) => o.id.startsWith('custom:'))
      expect(custom!.label).toContain('/opt/wps/')
    })

    it('get ausente (undefined): globalPlayer vira associated', async () => {
      const { result } = setup({
        externalPlayer: {
          get: vi.fn(async () => undefined),
          detect: vi.fn(async () => []),
          listCustom: vi.fn(async () => []),
        },
      })
      await result.loadPlayerChoices()
      expect(result.globalPlayer.value).toBe('associated')
    })
  })

})