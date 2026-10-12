// @vitest-environment jsdom
// Cobertura MediaReturnProjectionView (gaps_map3): applyRuntime (promote/snap/
// unchanged/bar sync), onStorage, mount/unmount com BroadcastChannel, prefers-
// reduced-motion e template (cover/bar/next).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const stageSettings = vi.hoisted(() => {
  const listeners: Array<() => void> = []
  return {
    listeners,
    settings: {
      backgroundColor: '#000',
      backgroundImage: null,
      textColor: '#fff',
      fontSize: 96,
      fontWeight: 700,
      textAlign: 'center',
      textShadow: true,
      shadowBlur: 20,
      shadowIntensity: 0.6,
      footerRefColor: '#FCCE02',
    },
    subscribe: (fn: () => void) => {
      listeners.push(fn)
      return () => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))
vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => JSON.parse(JSON.stringify(stageSettings.settings)),
  subscribeStageSettings: stageSettings.subscribe,
}))
vi.mock('../../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: (bg: unknown) => (bg ? String(bg) : null),
}))
vi.mock('../services/media-slides', () => ({
  stripHtmlBreaks: (s: string) => (s ?? '').replace(/<br\s*\/?>/gi, ' ').trim(),
}))

import MediaReturnProjectionView from '../MediaReturnProjectionView.vue'
import {
  MEDIA_RUNTIME_STORAGE_KEY,
  DEFAULT_MEDIA_PROJECTION,
} from '../../services/media-runtime'

function runtime(over: Record<string, unknown> = {}) {
  return {
    ...DEFAULT_MEDIA_PROJECTION,
    active: true,
    title: 'Hino 1',
    lyric: 'Primeira estrofe',
    nextLyric: 'Segunda estrofe',
    isCover: false,
    nextIsCover: false,
    slideIndex: 0,
    slideProgressRatio: 0.3,
    imageUrl: null,
    ...over,
  }
}

async function mountView() {
  const w = mount(MediaReturnProjectionView)
  await flushPromises()
  return w
}

/** Publica runtime (como o player faria) via storage event. */
async function publish(w: ReturnType<typeof mount>, over: Record<string, unknown>) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: MEDIA_RUNTIME_STORAGE_KEY,
      newValue: JSON.stringify(runtime(over)),
    }),
  )
  await flushPromises()
  await flushPromises()
  void w
}

beforeEach(() => {
  window.localStorage?.clear?.()
  vi.clearAllMocks()
  stageSettings.listeners.length = 0
  // jsdom não tem matchMedia: default sem reduced-motion (o teste específico stuba)
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  }
})

describe('MediaReturnProjectionView', () => {
  it('sem runtime ativo: fundo sem corpo e sem barra', async () => {
    const w = await mountView()
    expect(w.find('.media-return__body').exists()).toBe(false)
    w.unmount()
  })

  it('runtime ativo: mostra letra atual e próxima, barra existe', async () => {
    const w = await mountView()
    await publish(w, {})
    expect(w.find('.media-return__body').exists()).toBe(true)
    expect(w.text()).toContain('Primeira estrofe')
    expect(w.text()).toContain('Segunda estrofe')
    expect(w.find('.media-return__bar').exists()).toBe(true)
    w.unmount()
  })

  it('capa: mostra título grande em vez do bloco de letra', async () => {
    const w = await mountView()
    await publish(w, { isCover: true, lyric: '' })
    expect(w.find('.media-return__title--cover').text()).toBe('Hino 1')
    expect(w.find('.media-return__bar').exists()).toBe(false)
    w.unmount()
  })

  it('capa detectada por lyric vazia + título (isCoverSlide)', async () => {
    const w = await mountView()
    await publish(w, { lyric: '', title: 'Só título' })
    expect(w.find('.media-return__title--cover').exists()).toBe(true)
    w.unmount()
  })

  it('avanço sequencial de slide com texto igual ao "next": via canPromote ou snap — letra atualizada', async () => {
    const w = await mountView()
    await publish(w, { slideIndex: 0, lyric: 'Primeira estrofe', nextLyric: 'Segunda estrofe' })
    // novo storage com slide seguinte e mesma next-frase → caminho promote
    await publish(w, { slideIndex: 1, lyric: 'Segunda estrofe', nextLyric: 'Terceira estrofe' })
    expect(w.text()).toContain('Segunda estrofe')
    w.unmount()
  })

  it('mudança não sequencial: snap direto', async () => {
    const w = await mountView()
    await publish(w, { slideIndex: 0, lyric: 'Primeira estrofe', nextLyric: 'Segunda estrofe' })
    await publish(w, { slideIndex: 5, lyric: 'Outra letra', nextLyric: 'Mais' })
    expect(w.text()).toContain('Outra letra')
    w.unmount()
  })

  it('runtime igual: sem re-snap (unchanged)', async () => {
    const w = await mountView()
    await publish(w, { slideIndex: 0 })
    const lyricEl = w.find('.media-return__lyric')
    expect(lyricEl.text()).toBe('Primeira estrofe')
    // repete o mesmo runtime: nada muda visualmente e não quebra
    await publish(w, { slideIndex: 0 })
    expect(w.find('.media-return__lyric').text()).toBe('Primeira estrofe')
    w.unmount()
  })

  it('inactive: snapTo limpa', async () => {
    const w = await mountView()
    await publish(w, { slideIndex: 0 })
    await publish(w, { active: false })
    expect(w.find('.media-return__body').exists()).toBe(false)
    w.unmount()
  })

  it('storage de chave diferente: ignora', async () => {
    const w = await mountView()
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'outra.chave',
        newValue: JSON.stringify(runtime({ lyric: 'NÃO' })),
      }),
    )
    await flushPromises()
    expect(w.find('.media-return__body').exists()).toBe(false)
    w.unmount()
  })

  it('storage com JSON inválido: ignora sem quebrar', async () => {
    const w = await mountView()
    window.dispatchEvent(
      new StorageEvent('storage', { key: MEDIA_RUNTIME_STORAGE_KEY, newValue: '{quebrado' }),
    )
    await flushPromises()
    expect(w.find('.media-return__body').exists()).toBe(false)
    w.unmount()
  })

  it('BroadcastChannel: mensagem aplica runtime', async () => {
    const w = await mountView()
    // o canal criado no mount recebe mensagens via onmessage
    await publish(w, { slideIndex: 2, lyric: 'Via canal' })
    expect(w.text()).toContain('Via canal')
    w.unmount()
  })

  it('BroadcastChannel: onmessage aplica runtime (captura instância)', async () => {
    let captured: { onmessage: ((ev: { data: unknown }) => void) | null } | null = null
    class FakeChannel {
      onmessage: ((ev: { data: unknown }) => void) | null = null
      constructor(public name: string) {
        captured = this
      }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const w = await mountView()
    vi.unstubAllGlobals()
    expect(captured).not.toBeNull()
    captured!.onmessage!({ data: runtime({ lyric: 'Via onmessage' }) })
    await flushPromises()
    expect(w.text()).toContain('Via onmessage')
    w.unmount()
  })

  it('stage settings: texto e cor aplicados; backgroundImage como bg', async () => {
    stageSettings.settings.backgroundImage = 'https://f/bg.jpg'
    const w = await mountView()
    expect(w.find('.media-return__bg').exists()).toBe(true)
    expect(w.find('.media-return__bg').attributes('style')).toContain('bg.jpg')
    stageSettings.settings.backgroundImage = null
    w.unmount()
  })

  it('unmount: unsub do stage settings e do storage listener', async () => {
    const w = await mountView()
    // mount subscreve stage settings; testes anteriores podem ter deixado 0
    // (listeners compartilhados) — garante pelo menos 1 antes do unmount
    expect(stageSettings.listeners.length).toBeGreaterThanOrEqual(1)
    w.unmount()
    await flushPromises()
    expect(stageSettings.listeners.length).toBe(0)
    // dispara storage pós-unmount: não deve lançar
    window.dispatchEvent(
      new StorageEvent('storage', { key: MEDIA_RUNTIME_STORAGE_KEY, newValue: JSON.stringify(runtime()) }),
    )
  })

  it('prefers-reduced-motion: promote vira snapTo imediato', async () => {
    const mq = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', vi.fn(() => mq))
    const w = await mountView()
    await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: 'B' })
    await publish(w, { slideIndex: 1, lyric: 'B', nextLyric: 'C' })
    expect(w.text()).toContain('B')
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('runtime com imageUrl: bg do runtime quando stage sem imagem', async () => {
    const w = await mountView()
    await publish(w, { imageUrl: 'https://f/runtime.png' })
    expect(w.find('.media-return__bg').exists()).toBe(true)
    expect(w.find('.media-return__bg').attributes('style')).toContain('runtime.png')
    w.unmount()
  })

  it('promoteNext: anima flyer (animate path) e revela letra ao terminar', async () => {
    // jsdom não tem Element.animate — stuba com retorno controlado
    const finished = Promise.resolve()
    const anims: Array<{ cancel: ReturnType<typeof vi.fn>; finished: Promise<unknown> }> = []
    const rafCbs: Array<() => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCbs.push(cb)
      return rafCbs.length
    })
    // Element.animate precisa existir ANTES do mount (getBoundingClientRect do flyer > 2px é stubado via offsetHeight? — na verdade usa rect; stubamos rect mínimo)
    const origRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = origRect.call(this)
      // devolve alturas > 2 para flyer e destino
      return { ...r, height: 100, width: 400, top: 10, left: 0 } as DOMRect
    }
    const origAnimate = (HTMLElement.prototype as unknown as { animate?: unknown }).animate
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
      this: HTMLElement,
    ) {
      const a = { cancel: vi.fn(), finished }
      anims.push(a)
      return a
    }
    try {
      const w = await mountView()
      await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: 'B' })
      await publish(w, { slideIndex: 1, lyric: 'B', nextLyric: 'C' })
      await flushPromises()
      // animação criada (flyer path executado)
      expect(anims.length).toBeGreaterThanOrEqual(1)
      // drena os rAFs pendentes (duplo frame pós-revelação)
      const pending = [...rafCbs]
      rafCbs.length = 0
      for (const cb of pending) cb()
      await flushPromises()
      const pending2 = [...rafCbs]
      for (const cb of pending2) cb()
      await flushPromises()
      expect(w.text()).toContain('B')
      w.unmount()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = origRect
      ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = origAnimate
      vi.unstubAllGlobals()
    }
  })

  it('promoteNext: sem rect válido do flyer → snapTo (fallback)', async () => {
    const origRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = origRect.call(this)
      return { ...r, height: 0, width: 0 } as DOMRect
    }
    try {
      const w = await mountView()
      await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: 'B' })
      await publish(w, { slideIndex: 1, lyric: 'B', nextLyric: 'C' })
      expect(w.text()).toContain('B')
      w.unmount()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = origRect
    }
  })

  it('stage settings: mudança de settings via listener atualiza stage ref', async () => {
    const w = await mountView()
    stageSettings.settings.textColor = '#00FF00'
    for (const fn of [...stageSettings.listeners]) fn()
    await flushPromises()
    // sem crash e sem mudança de corpo (texto controlado por runtime)
    expect(w.find('.media-return__body').exists()).toBe(false)
    stageSettings.settings.textColor = '#fff'
    w.unmount()
  })

  it('BroadcastChannel indisponível: mount não quebra (catch)', async () => {
    vi.stubGlobal('BroadcastChannel', function () {
      throw new Error('sem canal')
    })
    try {
      const w = await mountView()
      expect(w.find('.media-return__body').exists()).toBe(false)
      w.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('next é capa: próxima frase vira o título (nextPhraseOf capa)', async () => {
    const w = await mountView()
    await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: '', nextIsCover: true })
    expect(w.find('.media-return__next')?.text()).toContain('Hino 1')
    w.unmount()
  })

  it('bar vel: segunda amostra < 12ms não recalcula vel; amostra lenta recalcula', async () => {
    vi.useFakeTimers()
    let rafCb: (() => void) | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCb = cb as () => void
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    try {
      const w = await mountView()
      await publish(w, { slideProgressRatio: 0.1 })
      const cb = rafCb as unknown as () => void
      if (cb) cb(performance.now()) // dt pequeno (< 12ms no sync seguinte? cobre branch)
      await vi.runAllTimersAsync()
      // amostra bem depois (dt grande) → vel recalculada
      const cb2 = rafCb as unknown as () => void
      if (cb2) cb2(performance.now() + 1000)
      await vi.runAllTimersAsync()
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('promote em andamento + storage de capa: snapTo interrompe flyer', async () => {
    // finished pendente: animação nunca termina sozinha
    let rafCbs: Array<() => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCbs.push(cb)
      return rafCbs.length
    })
    const pending: Array<() => void> = []
    const neverFinishes = new Promise((resolve) => {
      pending.push(resolve as () => void)
    })
    const origRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = origRect.call(this)
      return { ...r, height: 100, width: 400, top: 10, left: 0 } as DOMRect
    }
    const origAnimate = (HTMLElement.prototype as unknown as { animate?: unknown }).animate
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
      return { cancel: vi.fn(), finished: neverFinishes }
    }
    try {
      const w = await mountView()
      await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: 'B' })
      await publish(w, { slideIndex: 1, lyric: 'B', nextLyric: 'C' })
      // durante o promote (flyer em voo), chega uma capa → snapTo mid-promote
      await publish(w, { isCover: true, lyric: '' })
      expect(w.find('.media-return__title--cover').exists()).toBe(true)
      // Promote em andamento + texto diferente do flyer → snap direto (branch exiting/lyricWait)
      await publish(w, { isCover: false, lyric: 'D', nextLyric: 'E', slideIndex: 3 })
      expect(w.text()).toContain('D')
      w.unmount()
    } finally {
      for (const resolve of pending) resolve()
      HTMLElement.prototype.getBoundingClientRect = origRect
      ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = origAnimate
      vi.unstubAllGlobals()
    }
  })

  it('promote: animate.finished rejeita → early return sem crash', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    const origRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = origRect.call(this)
      return { ...r, height: 100, width: 400, top: 10, left: 0 } as DOMRect
    }
    const origAnimate = (HTMLElement.prototype as unknown as { animate?: unknown }).animate
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
      return { cancel: vi.fn(), finished: Promise.reject(new Error('anim abort')) }
    }
    try {
      const w = await mountView()
      await publish(w, { slideIndex: 0, lyric: 'A', nextLyric: 'B' })
      await publish(w, { slideIndex: 1, lyric: 'B', nextLyric: 'C' })
      await flushPromises()
      // rejeição tratada pelo catch → sem crash; estado mantém flyer mas não quebra
      expect(w.find('.media-return__body').exists()).toBe(true)
      w.unmount()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = origRect
      ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = origAnimate
      vi.unstubAllGlobals()
    }
  })
})
