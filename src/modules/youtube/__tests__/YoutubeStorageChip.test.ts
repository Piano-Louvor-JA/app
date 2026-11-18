import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OnlineVideoItemStatus } from '@shared/types/desktop-bridge'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, p?: Record<string, unknown>) => (p ? `${key} ${JSON.stringify(p)}` : key) }),
}))

import YoutubeStorageChip from '../components/YoutubeStorageChip.vue'

const GB = 1024 ** 3
const MB = 1024 ** 2
const original = window.louvorja

function setBridge(onlineVideo: unknown, isElectron = true) {
  Object.defineProperty(window, 'louvorja', { value: { isElectron, onlineVideo }, configurable: true, writable: true })
}

function makeApi(status: Record<string, unknown>) {
  let changed: ((p: { id: string; status: OnlineVideoItemStatus }) => void) | null = null
  const stop = vi.fn()
  const api = {
    status: vi.fn(async () => status),
    openFolder: vi.fn(async () => true),
    onChanged: vi.fn((cb: typeof changed) => { changed = cb; return stop }),
  }
  return { api, stop, emit: (s: OnlineVideoItemStatus) => changed?.({ id: 'AAAAAAAAAAA', status: s }) }
}

const twoFolders = {
  hidden: false,
  available: true,
  usage: { bytes: 0, count: 0, limitBytes: Infinity },
  folders: {
    system: { dir: '/sys/video-cache', bytes: 500 * MB, count: 2, limitBytes: Infinity },
    custom: { dir: '/hd/LouvorJA-PIANO-videos', bytes: 2 * GB, count: 4, limitBytes: Infinity },
    active: 'custom',
  },
}

afterEach(() => {
  Object.defineProperty(window, 'louvorja', { value: original, configurable: true, writable: true })
  push.mockReset()
})

describe('espaço dos vídeos baixados no cabeçalho do YouTube', () => {
  it('botão mostra a soma; clicando, cada pasta com tamanho, caminho e quantidade', async () => {
    const { api } = makeApi(twoFolders)
    setBridge(api)
    const w = mount(YoutubeStorageChip, { attachTo: document.body })
    await flushPromises()
    expect(w.find('[data-testid="youtube-storage-total"]').text()).toBe('2.5 GB')
    expect(w.find('[role="dialog"]').exists()).toBe(false)

    await w.find('[data-testid="youtube-storage"]').trigger('click')
    await flushPromises()
    const system = w.find('[data-testid="youtube-storage-system"]')
    const custom = w.find('[data-testid="youtube-storage-custom"]')
    expect(system.text()).toContain('500 MB')
    expect(system.text()).toContain('/sys/video-cache')
    expect(custom.text()).toContain('2.0 GB')
    expect(custom.text()).toContain('youtube.storage.videos {"n":4}')
    expect(w.text()).toContain('youtube.storage.total {"n":6}')

    await custom.find('button').trigger('click')
    expect(api.openFolder).toHaveBeenCalledWith('custom')

    // Clique fora fecha.
    document.body.click()
    await flushPromises()
    expect(w.find('[role="dialog"]').exists()).toBe(false)

    await w.find('[data-testid="youtube-storage"]').trigger('click')
    const settings = w.findAll('button').find((b) => b.text().includes('youtube.download.manage'))!
    await settings.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'settings-media' })
    w.unmount()
  })

  it('download terminado atualiza o total; só a pasta do sistema (main antigo)', async () => {
    const { api, emit, stop } = makeApi({ hidden: false, available: true, cacheDir: '/sys', usage: { bytes: 3 * GB, count: 1, limitBytes: 6 * GB } })
    setBridge(api)
    const w = mount(YoutubeStorageChip)
    await flushPromises()
    expect(w.find('[data-testid="youtube-storage-total"]').text()).toBe('3.0 GB')
    emit({ state: 'downloading', progress: 0.3 })
    expect(api.status).toHaveBeenCalledTimes(1)
    emit({ state: 'ready' })
    await flushPromises()
    expect(api.status).toHaveBeenCalledTimes(2)
    await w.find('[data-testid="youtube-storage"]').trigger('click')
    expect(w.find('[data-testid="youtube-storage-custom"]').exists()).toBe(false)
    w.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('fora do desktop, sem suporte ou com erro: não aparece', async () => {
    setBridge(undefined, false)
    expect(mount(YoutubeStorageChip).find('[data-testid="youtube-storage"]').exists()).toBe(false)

    setBridge(makeApi({ hidden: true, available: true, usage: { bytes: 0, count: 0, limitBytes: 0 } }).api)
    const store = mount(YoutubeStorageChip)
    await flushPromises()
    expect(store.find('[data-testid="youtube-storage"]').exists()).toBe(false)

    const broken = makeApi({})
    broken.api.status.mockRejectedValue(new Error('ipc'))
    setBridge(broken.api)
    const w = mount(YoutubeStorageChip)
    await flushPromises()
    expect(w.find('[data-testid="youtube-storage"]').exists()).toBe(false)
  })
})
