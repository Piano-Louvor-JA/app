// Testes MusicTrackActions — emit(), showOfflineControls, download/remove/cancel, Teleport
// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'

// Mocks de serviços reais (mínimos)
const { mockDownloadTrackMedia, mockIsTrackMediaDownloaded, mockDeleteTrackMedia } = vi.hoisted(() => ({
  mockDownloadTrackMedia: vi.fn(),
  mockIsTrackMediaDownloaded: vi.fn(),
  mockDeleteTrackMedia: vi.fn(),
}))

const { mockReconcileAlbumsForMusic } = vi.hoisted(() => ({
  mockReconcileAlbumsForMusic: vi.fn(),
}))

const { mockIsDesktopApp } = vi.hoisted(() => ({
  mockIsDesktopApp: vi.fn(() => true),
}))

const { mockGetDesktopBridge } = vi.hoisted(() => ({
  mockGetDesktopBridge: vi.fn(() => null),
}))

vi.mock('@shared/services/track-media', () => ({
  downloadTrackMedia: mockDownloadTrackMedia,
  isTrackMediaDownloaded: mockIsTrackMediaDownloaded,
  deleteTrackMedia: mockDeleteTrackMedia,
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: mockIsDesktopApp,
}))

vi.mock('@modules/sync/stores/useLocalLibraryStore', () => ({
  useLocalLibraryStore: vi.fn(() => ({
    reconcileAlbumsForMusic: mockReconcileAlbumsForMusic,
  })),
}))

const mockFetch = vi.fn()
Object.defineProperty(window, 'fetch', { value: mockFetch })

import MusicTrackActions from '../MusicTrackActions.vue'
import { useLocalLibraryStore } from '@modules/sync/stores/useLocalLibraryStore'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      media: {
        actions: {
          sung: 'Cantado',
          instrumental: 'Instrumental',
          slides: 'Slides',
          lyric: 'Letra',
          thisTrack: 'esta faixa',
          downloaded: 'Baixado',
          removeOffline: 'Remover offline',
          cancelDownload: 'Cancelar',
          downloadOffline: 'Baixar offline',
          removeConfirmTitle: 'Confirmar',
          removeConfirmText: 'Remover {name}?',
          removeConfirmNo: 'Não',
          removeConfirmYes: 'Sim',
        },
      },
    },
  },
})


describe('MusicTrackActions — remove offline + cancel (gaps)', () => {
  const defaultProps = {
    hasInstrumental: true,
    busy: false,
    variant: 'plain',
    musicId: 123,
    trackName: 'Test Track',
    rowHovered: true,
    allowOfflineRemove: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDesktopApp.mockReturnValue(true)
    mockIsTrackMediaDownloaded.mockResolvedValue(true)
    mockDownloadTrackMedia.mockResolvedValue({ status: 'downloaded' })
    mockDeleteTrackMedia.mockResolvedValue(undefined)
    mockReconcileAlbumsForMusic.mockResolvedValue(undefined)
    ;(useLocalLibraryStore as any).mockReturnValue({
      reconcileAlbumsForMusic: mockReconcileAlbumsForMusic,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('remove offline: abre confirm e confirmar chama deleteTrackMedia', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await flushPromises()
    const removeBtn = wrapper.find('.music-track-actions__btn--remove')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await flushPromises()
    const yes = Array.from(document.querySelectorAll('button')).find((b) => /sim/i.test(b.textContent || ''))
    expect(yes).toBeTruthy()
    yes!.click()
    await flushPromises()
    expect(mockDeleteTrackMedia).toHaveBeenCalledWith(123)
    wrapper.unmount()
  })

  it('remove offline: cancelar não deleta', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await flushPromises()
    const removeBtn = wrapper.find('.music-track-actions__btn--remove')
    await removeBtn.trigger('click')
    await flushPromises()
    const no = Array.from(document.querySelectorAll('button')).find((b) => /não/i.test(b.textContent || ''))
    expect(no).toBeTruthy()
    no!.click()
    await flushPromises()
    expect(mockDeleteTrackMedia).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('allowOfflineRemove=false: sem botão de remover', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: { ...defaultProps, allowOfflineRemove: false },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(wrapper.find('.music-track-actions__btn--remove').exists()).toBe(false)
    wrapper.unmount()
  })

  it('download: clicar baixar dispara downloadTrackMedia com progresso', async () => {
    mockIsTrackMediaDownloaded.mockResolvedValue(false)
    mockDownloadTrackMedia.mockImplementation((_id: number, opts: { onProgress: (p: number) => void }) => {
      opts.onProgress(42)
      return Promise.resolve({ status: 'downloaded' })
    })
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    await flushPromises()
    const dlBtn = wrapper.findAll('button').find((b) => (b.attributes('aria-label') || '').includes('Baixar offline'))
    expect(dlBtn).toBeTruthy()
    await dlBtn!.trigger('click')
    await flushPromises()
    expect(mockDownloadTrackMedia).toHaveBeenCalledWith(123, expect.objectContaining({ onProgress: expect.any(Function) }))
    wrapper.unmount()
  })
})
