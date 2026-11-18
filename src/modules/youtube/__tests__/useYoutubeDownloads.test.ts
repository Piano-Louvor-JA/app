import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import type { OnlineVideoItemStatus } from '@shared/types/desktop-bridge'

import { isDownloading, useYoutubeDownloads } from '../composables/useYoutubeDownloads'

const A = 'AAAAAAAAAAA'
const original = window.louvorja

function setBridge(onlineVideo: unknown, isElectron = true) {
  Object.defineProperty(window, 'louvorja', { value: { isElectron, onlineVideo }, configurable: true, writable: true })
}

function makeApi(overrides: Record<string, unknown> = {}) {
  let changed: ((p: { id: string; status: OnlineVideoItemStatus }) => void) | null = null
  const stop = vi.fn()
  const api = {
    status: vi.fn(async () => ({ hidden: false, available: true })),
    videoStatus: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { state: 'ready' }]))),
    download: vi.fn(async () => true),
    cancel: vi.fn(async () => {}),
    remove: vi.fn(async () => true),
    onChanged: vi.fn((cb: typeof changed) => { changed = cb; return stop }),
    ...overrides,
  }
  return { api, stop, emit: (id: string, status: OnlineVideoItemStatus) => changed?.({ id, status }) }
}

function host() {
  let result!: ReturnType<typeof useYoutubeDownloads>
  const wrapper = mount(defineComponent({ setup() { result = useYoutubeDownloads(); return () => null } }))
  return { wrapper, get d() { return result } }
}

afterEach(() => {
  Object.defineProperty(window, 'louvorja', { value: original, configurable: true, writable: true })
})

describe('downloads do módulo YouTube', () => {
  it('em andamento: fila, descoberta, download e montagem', () => {
    expect(['queued', 'resolving', 'downloading', 'muxing'].every((state) => isDownloading({ state } as OnlineVideoItemStatus))).toBe(true)
    expect(isDownloading({ state: 'ready' })).toBe(false)
    expect(isDownloading(undefined)).toBe(false)
  })

  it('consulta o estado dos vídeos, baixa, acompanha o progresso e cancela', async () => {
    const { api, stop, emit } = makeApi()
    setBridge(api)
    const h = host()
    await flushPromises()
    expect(h.d.supported.value).toBe(true)

    await h.d.refresh([A, A, 'curto'])
    expect(api.videoStatus).toHaveBeenCalledWith([A])
    expect(h.d.statuses.value[A]).toEqual({ state: 'ready' })
    await h.d.refresh(['curto'])
    expect(api.videoStatus).toHaveBeenCalledTimes(1)

    expect(await h.d.download(A)).toBe(true)
    expect(api.download).toHaveBeenCalledWith([A])
    emit(A, { state: 'downloading', progress: 0.4 })
    expect(h.d.statuses.value[A]).toEqual({ state: 'downloading', progress: 0.4 })

    await h.d.cancel(A)
    expect(api.cancel).toHaveBeenCalledWith(A)
    h.wrapper.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('falhas: download recusado ou com erro vira "error"; status falhando desliga', async () => {
    const { api } = makeApi({ download: vi.fn(async () => false) })
    setBridge(api)
    const h = host()
    await flushPromises()
    expect(await h.d.download(A)).toBe(false)
    expect(h.d.statuses.value[A]).toEqual({ state: 'error' })
    api.download.mockRejectedValueOnce(new Error('ipc'))
    expect(await h.d.download(A)).toBe(false)
    api.videoStatus.mockRejectedValueOnce(new Error('ipc'))
    await h.d.refresh([A])

    const broken = makeApi({ status: vi.fn(async () => { throw new Error('x') }) })
    setBridge(broken.api)
    const h2 = host()
    await flushPromises()
    expect(h2.d.supported.value).toBe(false)
    await h2.d.refresh([A])
    expect(broken.api.videoStatus).not.toHaveBeenCalled()
  })

  it('fora do desktop, na Microsoft Store ou sem suporte: nada aparece', async () => {
    setBridge(undefined, false)
    const h = host()
    await flushPromises()
    expect(h.d.supported.value).toBe(false)
    expect(await h.d.download(A)).toBe(false)
    await h.d.cancel(A)

    const store = makeApi({ status: vi.fn(async () => ({ hidden: true, available: true })) })
    setBridge(store.api)
    const h2 = host()
    await flushPromises()
    expect(h2.d.supported.value).toBe(false)
  })
})

describe('apagar o vídeo baixado', () => {
  it('apaga e volta para "Baixar"; recusado ou com erro devolve false', async () => {
    const { api } = makeApi()
    setBridge(api)
    const h = host()
    await flushPromises()
    await h.d.refresh([A])
    expect(await h.d.remove(A)).toBe(true)
    expect(api.remove).toHaveBeenCalledWith(A)
    expect(h.d.statuses.value[A]).toEqual({ state: 'none' })
    api.remove.mockResolvedValueOnce(false)
    expect(await h.d.remove(A)).toBe(false)
    api.remove.mockRejectedValueOnce(new Error('ipc'))
    expect(await h.d.remove(A)).toBe(false)

    setBridge(undefined, false)
    const off = host()
    expect(await off.d.remove(A)).toBe(false)
  })
})

describe('baixar todos (coletânea)', () => {
  it('manda a lista inteira de uma vez e marca todos na fila; falha marca todos', async () => {
    const B = 'BBBBBBBBBBB'
    const { api } = makeApi()
    setBridge(api)
    const h = host()
    await flushPromises()
    expect(await h.d.download([A, B, 'curto'])).toBe(true)
    expect(api.download).toHaveBeenCalledWith([A, B])
    expect(h.d.statuses.value[A]).toEqual({ state: 'queued' })
    expect(h.d.statuses.value[B]).toEqual({ state: 'queued' })
    api.download.mockResolvedValueOnce(false)
    await h.d.download([A, B])
    expect(h.d.statuses.value[B]).toEqual({ state: 'error' })
    expect(await h.d.download(['curto'])).toBe(false)
  })
})
