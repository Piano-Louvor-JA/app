import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

const unsub = vi.fn()
const bridgeMock: Record<string, unknown> = {
  downloadBatch: {
    pending: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    retry: vi.fn().mockResolvedValue({ ok: true }),
    onProgress: vi.fn().mockReturnValue(unsub),
    onItemDone: vi.fn().mockReturnValue(unsub),
    onItemFailed: vi.fn().mockReturnValue(unsub),
    onBatchDone: vi.fn().mockReturnValue(unsub),
  },
}

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridgeMock,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => {
    if (!p) return k
    return Object.entries(p).reduce((acc, [key, val]) => acc!.replace(`{${key}}`, String(val)), k)
  } }),
}))

import DownloadIndicator from '../DownloadIndicator.vue'
import { useDownloadStore } from '../../stores/useDownloadStore'

async function advance() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('DownloadIndicator (T5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    bridgeMock.downloadBatch = {
      pending: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      retry: vi.fn().mockResolvedValue({ ok: true }),
      onProgress: vi.fn().mockReturnValue(unsub),
      onItemDone: vi.fn().mockReturnValue(unsub),
      onItemFailed: vi.fn().mockReturnValue(unsub),
      onBatchDone: vi.fn().mockReturnValue(unsub),
    }
  })

  it('não renderiza quando idle (web ou sem downloads)', async () => {
    const wrapper = mount(DownloadIndicator)
    await advance()
    expect(wrapper.find('[data-test="download-indicator"]').exists()).toBe(false)
  })

  it('renderiza ícone + % quando ativo', async () => {
    const wrapper = mount(DownloadIndicator)
    await advance()
    const store = useDownloadStore()
    const cb = (bridgeMock.downloadBatch as { onProgress: (fn: (p: unknown) => void) => void }).onProgress.mock.calls[0][0] as (p: unknown) => void
    cb({ done: 1, total: 13, current: { id: 'x', fileName: 'a.mp4', receivedBytes: 100, totalBytes: 200 } })
    await advance()
    expect(wrapper.find('[data-test="download-indicator"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="download-indicator-percent"]').text()).toContain('%')
  })

  it('popover abre ao clicar mostrando arquivo atual', async () => {
    const wrapper = mount(DownloadIndicator)
    await advance()
    const cb = (bridgeMock.downloadBatch as { onProgress: (fn: (p: unknown) => void) => void }).onProgress.mock.calls[0][0] as (p: unknown) => void
    cb({ done: 1, total: 13, current: { id: 'x', fileName: 'a.mp4', receivedBytes: 100, totalBytes: 200 } })
    await advance()
    await wrapper.get('[data-test="download-indicator-btn"]').trigger('click')
    expect(wrapper.find('[data-test="download-indicator-popover"]').exists()).toBe(true)
    expect(wrapper.get('.download-indicator__file').text()).toContain('a.mp4')
  })

  it('ponto vermelho quando houve falha', async () => {
    const wrapper = mount(DownloadIndicator)
    await advance()
    const onFailed = (bridgeMock.downloadBatch as { onItemFailed: (fn: (p: unknown) => void) => void }).onItemFailed.mock.calls[0][0] as (p: unknown) => void
    onFailed({ id: 'x', fileName: 'a.mp4', reason: 'http-500' })
    const cb = (bridgeMock.downloadBatch as { onProgress: (fn: (p: unknown) => void) => void }).onProgress.mock.calls[0][0] as (p: unknown) => void
    cb({ done: 1, total: 13, current: null })
    await advance()
    expect(wrapper.find('[data-test="download-indicator-failed"]').exists()).toBe(true)
  })
})
