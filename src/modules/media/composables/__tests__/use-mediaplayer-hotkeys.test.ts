// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Hotkeys ←/→ do player — via mount real. Valida comportamento observável:
 * slideIndex avança/recua e o registro de IPC ocorre.
 */

vi.mock('../services/media-audio', () => ({
  attachMediaAudioListeners: vi.fn(),
  detachMediaAudioListeners: vi.fn(),
  fadeInMediaAudio: vi.fn().mockResolvedValue(true),
  fadeOutMediaAudio: vi.fn().mockResolvedValue(undefined),
  fadeVolumeMediaAudio: vi.fn().mockResolvedValue(undefined),
  formatMediaClock: vi.fn(() => '00:00'),
  getMediaAudioElement: vi.fn(() => ({
    volume: 1, paused: true, currentTime: 0, duration: 100, readyState: 4,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), load: vi.fn(),
    play: vi.fn().mockResolvedValue(true), pause: vi.fn(), removeAttribute: vi.fn(),
  })),
  pauseMediaAudio: vi.fn(),
  playMediaAudio: vi.fn().mockResolvedValue(true),
  resolveMusicAudioUrl: vi.fn().mockResolvedValue({ ok: true, url: 'audio://x', source: 'remote' }),
  resolveSlideImageUrl: vi.fn().mockResolvedValue(null),
  stopAllMediaAudio: vi.fn(),
  switchMediaAudioElement: vi.fn(),
}))

vi.mock('../../services/media-catalog', () => ({
  loadMediaTrack: vi.fn().mockResolvedValue({
    id: 1,
    name: 'F',
    durationLabel: '1:00',
    audioUrl: null,
    instrumentalUrl: null,
    coverUrl: null,
    coverPosition: null,
    albums: [],
    categories: [],
    lyrics: [
      { order: 1, lyric: 'um', showSlide: true, time: '00:01', instrumentalTime: '00:01', imageUrl: null, imagePosition: null, isCover: false },
      { order: 2, lyric: 'dois', showSlide: true, time: '00:02', instrumentalTime: '00:02', imageUrl: null, imagePosition: null, isCover: false },
    ],
  }),
  resolveAlbumSubtitle: vi.fn(() => ''),
}))

const bridge = vi.hoisted(() => ({
  onMediaNavigate: null as ((d: string) => void) | null,
}))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => ({
    projection: {
      onMediaNavigate: (cb: (d: string) => void) => {
        bridge.onMediaNavigate = cb
      },
    },
    workspace: {
      getRecord: vi.fn().mockResolvedValue(null),
      setRecord: vi.fn().mockResolvedValue(undefined),
    },
    media: {
      check: vi.fn().mockResolvedValue(true),
    },
  }),
  isDesktopApp: () => true,
  isElectronShell: () => true,
  isWindowsDesktop: () => true,
}))

import { useMediaPlayerHotkeys } from '../useMediaPlayerHotkeys'
import { useMediaStore } from '../../stores/useMediaStore'

const Host = defineComponent2()

function defineComponent2() {
  return defineComponent({
    setup() {
      const store = useMediaStore()
      store.open({ musicId: 1, mode: 'no_audio', project: false })
      useMediaPlayerHotkeys(() => false)
      return { store }
    },
    render(this: { store: { slideIndex: { value: number } } }) {
      return null
    },
  })
}

function fireKey(target: HTMLElement | null, key: string) {
  const event = new KeyboardEvent('keydown', { key })
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  window.dispatchEvent(event)
}

beforeEach(() => {
  Object.defineProperty(document, 'activeElement', { configurable: true, value: null, writable: true })
  window.focus = () => {}
  setActivePinia(createPinia())
})

afterEach(() => {
})

describe('useMediaPlayerHotkeys', () => {
  it('ArrowLeft/ArrowRight navegam slides quando player ativo', async () => {
    const wrapper = mount(Host)
    const store = useMediaStore()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.slideCount).toBe(3)
    expect(store.slideIndex).toBe(0)
    fireKey(document.body, 'ArrowRight')
    expect(store.slideIndex).toBe(1)
    fireKey(document.body, 'ArrowLeft')
    expect(store.slideIndex).toBe(0)
    wrapper.unmount()
  })

  it('input de texto bloqueia; range não bloqueia', async () => {
    const wrapper = mount(Host)
    await new Promise((r) => setTimeout(r, 0))
    const input = document.createElement('input')
    input.type = 'text'
    fireKey(input, 'ArrowRight')
    expect(store_slideIndex()).toBe(0)
    const range = document.createElement('input')
    range.type = 'range'
    fireKey(range, 'ArrowRight')
    expect(store_slideIndex()).toBe(1)
    const area = document.createElement('textarea')
    fireKey(area, 'ArrowRight')
    expect(store_slideIndex()).toBe(1)
    wrapper.unmount()
  })

  it('sem hotkeys: ArrowRight não avança', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const HostNoHk = defineComponent({
      setup() {
        const store = useMediaStore()
        store.open({ musicId: 1, mode: 'no_audio', project: false })
        return () => undefined
      },
    })
    mount(HostNoHk)
    await new Promise((r) => setTimeout(r, 0))
    fireKey(document.body, 'ArrowRight')
    await new Promise((r) => setTimeout(r, 50))
    const store = useMediaStore()
    expect(store.slideIndex).toBe(0)
  })

  it('sem sessão: ignora', () => {
    const store = useMediaStore()
    fireKey(document.body, 'ArrowLeft')
    expect(store.slideIndex).toBe(0)
  })

  it('IPC onMediaNavigate: previous/next', async () => {
    const wrapper = mount(Host)
    await new Promise((r) => setTimeout(r, 0))
    expect(bridge.onMediaNavigate).toBeTruthy()
    bridge.onMediaNavigate!('previous')
    bridge.onMediaNavigate!('next')
    wrapper.unmount()
  })
  describe('reclaimOperatorFocus — blur de button/range (gaps)', () => {
    function mountWithLateOpen() {
      const pinia = createPinia()
      setActivePinia(pinia)
      const HostLate = defineComponent({
        setup() {
          const store = useMediaStore()
          useMediaPlayerHotkeys(() => false)
          // abre DEPOIS de montado: dispara o watch → scheduleReclaims
          setTimeout(() => store.open({ musicId: 1, mode: 'no_audio', project: false }), 0)
          return {}
        },
        render: () => null,
      })
      return mount(HostLate, { global: { plugins: [pinia] } })
    }

    it('foco em button: blur chamado (timers 50/200/500)', async () => {
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      btn.focus()
      Object.defineProperty(document, 'activeElement', { configurable: true, value: btn, writable: true })
      const blurSpy = vi.spyOn(btn, 'blur')
      const w = mountWithLateOpen()
      await new Promise((r) => setTimeout(r, 600))
      expect(blurSpy).toHaveBeenCalled()
      w.unmount()
      btn.remove()
    })

    it('foco em input[type=range]: blur chamado', async () => {
      const input = document.createElement('input')
      input.type = 'range'
      document.body.appendChild(input)
      input.focus()
      Object.defineProperty(document, 'activeElement', { configurable: true, value: input, writable: true })
      const blurSpy = vi.spyOn(input, 'blur')
      const w = mountWithLateOpen()
      await new Promise((r) => setTimeout(r, 600))
      expect(blurSpy).toHaveBeenCalled()
      w.unmount()
      input.remove()
    })

    it('foco em input de texto: NÃO faz blur', async () => {
      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)
      input.focus()
      Object.defineProperty(document, 'activeElement', { configurable: true, value: input, writable: true })
      const blurSpy = vi.spyOn(input, 'blur')
      const w = mountWithLateOpen()
      await new Promise((r) => setTimeout(r, 600))
      expect(blurSpy).not.toHaveBeenCalled()
      w.unmount()
      input.remove()
    })

    it('foco no body: sem elemento pra desfocar, não lança', async () => {
      Object.defineProperty(document, 'activeElement', { configurable: true, value: document.body, writable: true })
      const w = mountWithLateOpen()
      await new Promise((r) => setTimeout(r, 600))
      expect(document.activeElement).toBeTruthy()
      w.unmount()
    })
  })

  describe('gaps — isTypingTarget e IPC direcional', () => {
    it('target null (não-HTMLElement): não bloqueia hotkey', async () => {
      const w = mount(Host)
      await w.vm.$nextTick()
      fireKey(null, 'ArrowRight')
      await new Promise((r) => setTimeout(r, 0))
      expect(useMediaStore().slideIndex).toBe(1)
      w.unmount()
    })

    it('contentEditable: bloqueia hotkey', async () => {
      const w = mount(Host)
      await w.vm.$nextTick()
      const div = document.createElement('div')
      Object.defineProperty(div, 'isContentEditable', { value: true })
      fireKey(div, 'ArrowRight')
      expect(store_slideIndex()).toBe(0)
      w.unmount()
    })

    it('IPC direction desconhecido: ignora', async () => {
      const w = mount(Host)
      await w.vm.$nextTick()
      bridge.onMediaNavigate?.('sideways')
      expect(store_slideIndex()).toBe(0)
      w.unmount()
    })

    it('janela de projeção: hotkey local e IPC ignorados', async () => {
      const projectionHost = defineComponent({
        setup() {
          const store = useMediaStore()
          store.open({ musicId: 1, mode: 'no_audio', project: false })
          useMediaPlayerHotkeys(() => true)
          return { store }
        },
        render() { return null },
      })
      const w = mount(projectionHost)
      await w.vm.$nextTick()
      fireKey(null, 'ArrowRight')
      bridge.onMediaNavigate?.('next')
      expect(store_slideIndex()).toBe(0)
      w.unmount()
    })
  })

})

function store_slideIndex() {
  return useMediaStore().slideIndex as unknown as number
}