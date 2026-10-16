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

// Listener registry do mock (badge live, 14/10)
const { tmSubs } = vi.hoisted(() => ({ tmSubs: new Set<(id: number, dl: boolean) => void>() }))

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
  onTrackMediaChanged: (l: (id: number, dl: boolean) => void) => tmSubs.add(l),
  offTrackMediaChanged: (l: (id: number, dl: boolean) => void) => tmSubs.delete(l),
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

describe('MusicTrackActions — badge live via evento track-media (14/10)', () => {
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
    tmSubs.clear()
    mockIsDesktopApp.mockReturnValue(true)
    mockIsTrackMediaDownloaded.mockResolvedValue(false) // NÃO baixado no mount
    ;(useLocalLibraryStore as any).mockReturnValue({
      reconcileAlbumsForMusic: mockReconcileAlbumsForMusic,
    })
  })

  it('evento changed(id, true) de outro fluxo → badge aparece sem interação', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(wrapper.find('.music-track-actions__check').exists()).toBe(false)

    // download termina em OUTRO fluxo (pre-play) → evento broadcast
    tmSubs.forEach((s) => s(123, true))
    await flushPromises()
    expect(wrapper.find('.music-track-actions__check').exists()).toBe(true)
    wrapper.unmount()
  })

  it('evento de outro id não mexe no badge', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    await flushPromises()
    tmSubs.forEach((s) => s(999, true))
    await flushPromises()
    expect(wrapper.find('.music-track-actions__check').exists()).toBe(false)
    wrapper.unmount()
  })

  it('unmount remove listener (sem leak)', async () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(tmSubs.size).toBe(1)
    wrapper.unmount()
    expect(tmSubs.size).toBe(0)
  })
})
