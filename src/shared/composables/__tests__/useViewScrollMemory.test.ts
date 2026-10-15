// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  SCROLL_MEMORY_MAX_ROUTES,
  SCROLL_RESTORE_TIMEOUT_MS,
  useViewScrollMemory,
} from '../useViewScrollMemory'

/** Elemento rolável com limite (jsdom não calcula alturas). */
function makeScrollable(el: Element, maxTop = 10_000) {
  let top = 0
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(v, maxTop))
    },
  })
  return {
    setMax(next: number) {
      maxTop = next
    },
  }
}

let router: Router
let wrapper: VueWrapper
let restore: (fullPath: string) => void
let view: HTMLElement
let viewCtl: ReturnType<typeof makeScrollable>

async function setup() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/a', component: {} },
      { path: '/b', component: {} },
      { path: '/p/:n', component: {} },
    ],
  })
  await router.push('/a')
  wrapper = mount(
    defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        ;({ restore } = useViewScrollMemory(root))
        return { root }
      },
      template: '<main ref="root"><section class="view"></section></main>',
    }),
    { global: { plugins: [router] }, attachTo: document.body },
  )
  view = wrapper.find('.view').element as HTMLElement
  viewCtl = makeScrollable(view)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'setTimeout'] })
  await setup()
})

afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useViewScrollMemory', () => {
  it('guarda a rolagem ao sair e restaura ao voltar', async () => {
    view.scrollTop = 300
    await router.push('/b')
    view.scrollTop = 0 // tela nova
    restore('/a')
    expect(view.scrollTop).toBe(300)
  })

  it('espera o conteúdo carregar (tenta a cada frame)', async () => {
    view.scrollTop = 300
    await router.push('/b')
    view.scrollTop = 0
    viewCtl.setMax(100)
    restore('/a')
    expect(view.scrollTop).toBe(100)

    viewCtl.setMax(1000)
    vi.advanceTimersToNextFrame()
    expect(view.scrollTop).toBe(300)
  })

  it('desiste depois do tempo limite', async () => {
    view.scrollTop = 300
    await router.push('/b')
    view.scrollTop = 0
    viewCtl.setMax(100)
    restore('/a')
    vi.advanceTimersByTime(SCROLL_RESTORE_TIMEOUT_MS + 100)
    viewCtl.setMax(1000)
    vi.advanceTimersByTime(100)
    expect(view.scrollTop).toBe(100)
  })

  it('para de restaurar se o usuário mexer (roda do mouse, toque, tecla ou clique)', async () => {
    for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown']) {
      view.scrollTop = 300
      await router.push(type === 'wheel' ? '/b' : `/p/${type}`)
      view.scrollTop = 0
      viewCtl.setMax(100)
      const target = type === 'keydown' ? window : view
      restore(router.currentRoute.value.fullPath === '/b' ? '/a' : '/b')
      target.dispatchEvent(new Event(type, { bubbles: true }))
      viewCtl.setMax(10_000)
      vi.advanceTimersToNextFrame()
      expect(view.scrollTop, type).toBe(100)
      await router.push('/a')
      viewCtl.setMax(10_000)
    }
  })

  it('sem rolagem salva não mexe em nada', async () => {
    await router.push('/b')
    view.scrollTop = 40
    restore('/a')
    expect(view.scrollTop).toBe(40)
  })

  it('sair sem rolagem apaga a posição antiga daquela tela', async () => {
    view.scrollTop = 300
    await router.push('/b')
    await router.push('/a')
    view.scrollTop = 0
    await router.push('/b')
    view.scrollTop = 7
    restore('/a')
    expect(view.scrollTop).toBe(7)
  })

  it('navegar de novo cancela uma restauração em andamento', async () => {
    view.scrollTop = 300
    await router.push('/b')
    view.scrollTop = 0
    viewCtl.setMax(100)
    restore('/a')
    await router.push('/p/1')
    viewCtl.setMax(1000)
    vi.advanceTimersToNextFrame()
    expect(view.scrollTop).toBe(100)
  })

  it(`guarda no máximo ${SCROLL_MEMORY_MAX_ROUTES} telas (descarta as mais antigas)`, async () => {
    view.scrollTop = 300
    await router.push('/p/0')
    for (let n = 0; n < SCROLL_MEMORY_MAX_ROUTES; n++) {
      view.scrollTop = 10
      await router.push(`/p/${n + 1}`)
    }
    view.scrollTop = 0
    restore('/a')
    expect(view.scrollTop).toBe(0)
    restore('/p/5')
    expect(view.scrollTop).toBe(10)
  })

  it('ao desmontar para de observar o router', async () => {
    wrapper.unmount()
    view.scrollTop = 300
    await router.push('/b')
    await setup()
    view.scrollTop = 0
    restore('/a')
    expect(view.scrollTop).toBe(0)
  })

  it('sem raiz montada não quebra', async () => {
    const r = createRouter({ history: createMemoryHistory(), routes: [{ path: '/x', component: {} }, { path: '/y', component: {} }] })
    await r.push('/x')
    let restoreOrphan!: (p: string) => void
    const w = mount(
      defineComponent({
        setup() {
          ;({ restore: restoreOrphan } = useViewScrollMemory(ref(null)))
          return () => null
        },
      }),
      { global: { plugins: [r] } },
    )
    await r.push('/y')
    expect(() => restoreOrphan('/x')).not.toThrow()
    w.unmount()
    await flushPromises()
  })
})
