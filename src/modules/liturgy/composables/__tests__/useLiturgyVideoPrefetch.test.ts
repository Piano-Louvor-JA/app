// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'

import type { OnlineVideoItemStatus, OnlineVideoToolsStatus } from '@/shared/types/desktop-bridge'
import { LITURGY_WEEKDAYS, type LiturgyItem } from '../../types/liturgy'

const store = reactive({
  currentItems: [] as LiturgyItem[],
  weekdays: {} as Record<string, LiturgyItem[]>,
  customLiturgies: [] as Array<{ items: LiturgyItem[] }>,
})
vi.mock('../../stores/useLiturgyStore', () => ({ useLiturgyStore: () => store }))

import { useLiturgyVideoPrefetch } from '../useLiturgyVideoPrefetch'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'
const originalLouvorja = window.louvorja

function video(id: string, videoId: string, url = `https://www.youtube.com/watch?v=${videoId}`): LiturgyItem {
  return { id, type: 'online_video', name: id, url } as LiturgyItem
}

function makeApi() {
  let changed: ((payload: { id: string; status: OnlineVideoItemStatus }) => void) | null = null
  let tools: ((status: OnlineVideoToolsStatus) => void) | null = null
  const stops = { changed: vi.fn(), tools: vi.fn() }
  const api = {
    prefetch: vi.fn(async () => {}),
    keep: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    videoStatus: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { state: id === A ? 'ready' : 'none' }])),
    ),
    onChanged: vi.fn((cb: typeof changed) => { changed = cb; return stops.changed }),
    onTools: vi.fn((cb: typeof tools) => { tools = cb; return stops.tools }),
  }
  return {
    api,
    stops,
    emitChanged: (id: string, status: OnlineVideoItemStatus) => changed?.({ id, status }),
    emitTools: (status: OnlineVideoToolsStatus) => tools?.(status),
  }
}

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'louvorja', { value: bridge, configurable: true, writable: true })
}

function mountComposable() {
  let result!: ReturnType<typeof useLiturgyVideoPrefetch>
  const wrapper = mount(defineComponent({
    setup() {
      result = useLiturgyVideoPrefetch()
      return () => h('div')
    },
  }))
  return { wrapper, result }
}

describe('useLiturgyVideoPrefetch', () => {
  beforeEach(() => {
    store.currentItems = [video('i1', A), video('i2', B), video('i3', A), { id: 'm', type: 'music', name: 'Hino' } as LiturgyItem]
    store.weekdays = Object.fromEntries(LITURGY_WEEKDAYS.map((day) => [day, []]))
    store.weekdays.saturday = [video('s1', A), video('s2', B)]
    store.customLiturgies = [{ items: [video('c1', C), video('c2', 'x', 'https://exemplo.com/site')] }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setBridge(originalLouvorja)
  })

  it('fora do desktop: não faz nada e não mostra selo', async () => {
    setBridge({ isElectron: false })
    const { result } = mountComposable()
    await flushPromises()
    expect(result.statusByItemId.value).toEqual({})
    setBridge(undefined)
    expect(mountComposable().result.statusByItemId.value).toEqual({})
  })

  it('liturgia aberta: pede o download antecipado e mostra o status por item', async () => {
    const { api } = makeApi()
    setBridge({ isElectron: true, onlineVideo: api })
    const { result } = mountComposable()
    await flushPromises()
    expect(api.prefetch).toHaveBeenCalledWith([A, B])
    expect(api.videoStatus).toHaveBeenCalledWith([A, B])
    expect(result.statusByItemId.value).toEqual({ i1: { state: 'ready' }, i3: { state: 'ready' } })
  })

  it('manter: vídeos de todas as liturgias; o que saiu de todas é cancelado', async () => {
    const { api } = makeApi()
    setBridge({ isElectron: true, onlineVideo: api })
    mountComposable()
    await flushPromises()
    expect(api.keep).toHaveBeenLastCalledWith([A, B, C])
    expect(api.cancel).not.toHaveBeenCalled()

    store.weekdays.saturday = [video('s1', A)]
    await nextTick()
    await flushPromises()
    expect(api.keep).toHaveBeenLastCalledWith([A, C])
    expect(api.cancel).toHaveBeenCalledWith(B)
    expect(api.cancel).toHaveBeenCalledTimes(1)
  })

  it('progresso chega pelo evento; mudar de dia baixa a liturgia nova; sem vídeos não pede nada', async () => {
    const { api, emitChanged } = makeApi()
    setBridge({ isElectron: true, onlineVideo: api })
    const { result } = mountComposable()
    await flushPromises()
    emitChanged(B, { state: 'downloading', progress: 0.5 })
    expect(result.statusByItemId.value.i2).toEqual({ state: 'downloading', progress: 0.5 })

    store.currentItems = [video('i4', C)]
    await flushPromises()
    expect(api.prefetch).toHaveBeenLastCalledWith([C])

    api.prefetch.mockClear()
    store.currentItems = [{ id: 'm', type: 'music', name: 'Hino' } as LiturgyItem]
    await flushPromises()
    expect(api.prefetch).not.toHaveBeenCalled()
  })

  it('ferramentas prontas (chave recém-ligada): pede de novo; outros estados não', async () => {
    const { api, emitTools } = makeApi()
    setBridge({ isElectron: true, onlineVideo: api })
    mountComposable()
    await flushPromises()
    api.prefetch.mockClear()
    emitTools({ state: 'installing', progress: 0.5 })
    await flushPromises()
    expect(api.prefetch).not.toHaveBeenCalled()
    emitTools({ state: 'ready', version: '1' })
    await flushPromises()
    expect(api.prefetch).toHaveBeenCalledWith([A, B])
  })

  it('falhas do main só ficam no log', async () => {
    const { api } = makeApi()
    api.prefetch.mockRejectedValueOnce(new Error('ipc'))
    api.keep.mockRejectedValueOnce(new Error('ipc'))
    api.cancel.mockRejectedValueOnce(new Error('ipc'))
    setBridge({ isElectron: true, onlineVideo: api })
    const { result } = mountComposable()
    await flushPromises()
    store.weekdays.saturday = []
    await flushPromises()
    expect(console.error).toHaveBeenCalledTimes(3)
    expect(result.statusByItemId.value).toEqual({})
  })

  it('sair da tela cancela as inscrições', async () => {
    const { api, stops } = makeApi()
    setBridge({ isElectron: true, onlineVideo: api })
    const { wrapper } = mountComposable()
    wrapper.unmount()
    expect(stops.changed).toHaveBeenCalled()
    expect(stops.tools).toHaveBeenCalled()
  })
})
