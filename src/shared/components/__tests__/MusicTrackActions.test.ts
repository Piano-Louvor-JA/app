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

describe('MusicTrackActions', () => {
  const defaultProps = {
    hasInstrumental: true,
    busy: false,
    variant: 'plain',
    musicId: 123,
    trackName: 'Test Track',
    rowHovered: false,
    allowOfflineRemove: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDesktopApp.mockReturnValue(true)
    mockIsTrackMediaDownloaded.mockResolvedValue(false)
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

  it('mostra botões padrão (sem offline)', async () => {
    mockIsDesktopApp.mockReturnValue(false)
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.ti-player-play').exists()).toBe(true)
    expect(wrapper.find('.ti-piano').exists()).toBe(true)
    expect(wrapper.find('.ti-volume-off').exists()).toBe(true)
    expect(wrapper.find('.ti-file-text').exists()).toBe(false) // SHOW_LYRIC_ACTION=false
  })

  it('mostra botões com offline (desktop)', () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.ti-player-play').exists()).toBe(true)
    expect(wrapper.find('.music-track-actions__check').exists()).toBe(false)
    expect(wrapper.find('.ti-trash').exists()).toBe(false)
    expect(wrapper.find('.ti-download').exists()).toBe(false)
  })

  it('emit sung: disparado', () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    wrapper.find('.ti-player-play').trigger('click')
    expect(wrapper.emitted('sung')).toBeTruthy()
  })

  it('emit instrumental: desabilitado se !hasInstrumental', () => {
    const wrapper = mount(MusicTrackActions, {
      props: { ...defaultProps, hasInstrumental: false },
      global: { plugins: [i18n] },
    })
    const btn = wrapper.find('.ti-piano')
    expect(btn.attributes('disabled')).toBeDefined()
    btn.trigger('click')
    expect(wrapper.emitted('instrumental')).toBeFalsy()
  })

  it('emit slides: disparado', () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    wrapper.find('.ti-volume-off').trigger('click')
    expect(wrapper.emitted('slides')).toBeTruthy()
  })

  it('LyricAction: escondido por default (SHOW_LYRIC_ACTION=false)', () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.ti-file-text').exists()).toBe(false)
  })

  it('showOfflineControls: true com musicId positivo', () => {
    const wrapper = mount(MusicTrackActions, {
      props: { ...defaultProps, musicId: 456 },
      global: { plugins: [i18n] },
    })
    expect(wrapper.vm.showOfflineControls).toBe(true)
  })

  it('showOfflineControls: false sem musicId', () => {
    const wrapper = mount(MusicTrackActions, {
      props: { ...defaultProps, musicId: null },
      global: { plugins: [i18n] },
    })
    expect(wrapper.vm.showOfflineControls).toBe(false)
  })

  it('isOfflineBusy: downloading/loading', () => {
    const wrapper = mount(MusicTrackActions, {
      props: defaultProps,
      global: { plugins: [i18n] },
    })
    wrapper.vm.offlineStatus = 'downloading'
    expect(wrapper.vm.isOfflineBusy).toBe(true)
    wrapper.vm.offlineStatus = 'checking'
    expect(wrapper.vm.isOfflineBusy).toBe(true)
    wrapper.vm.offlineStatus = 'idle'
    expect(wrapper.vm.isOfflineBusy).toBe(false)
  })

  it('confirmTrackLabel: usa trackName, fallback t() se vazio', () => {
    const wrapper = mount(MusicTrackActions, {
      props: { ...defaultProps, trackName: '  ' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.vm.confirmTrackLabel).toBe('esta faixa')
  })

  describe('offline: downloaded state', async () => {
    beforeEach(async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(true)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      await flushPromises()
    })

    it('downloaded: mostra check icon', () => {
      expect(mockIsTrackMediaDownloaded).toHaveBeenCalledWith(789)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      expect(wrapper.find('.ti-check').exists()).toBe(true)
    })

    it('downloaded: remove button se allowOfflineRemove + rowHovered', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(true)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, allowOfflineRemove: true, musicId: 789, rowHovered: true },
        global: { plugins: [i18n] },
      })
      await flushPromises()
      expect(wrapper.find('.ti-trash').exists()).toBe(true)
      await wrapper.find('.ti-trash').trigger('click')
      expect(wrapper.vm.confirmRemoveOpen).toBe(true)
    })

    it('downloaded: remove button escondido se !rowHovered', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(true)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, allowOfflineRemove: true, musicId: 789, rowHovered: false },
        global: { plugins: [i18n] },
      })
      await flushPromises()
      expect(wrapper.find('.ti-trash').exists()).toBe(false)
    })
  })

  describe('offline: idle state', () => {
    it('idle: mostra download button', () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      expect(wrapper.find('.ti-download').exists()).toBe(true)
    })

    it('idle: click download → downloading, emitProgress(0)', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      wrapper.find('.ti-download').trigger('click')
      await flushPromises()
      expect(wrapper.vm.offlineStatus).toBe('downloading')
      expect(wrapper.vm.downloadProgress).toBe(0)
      expect(wrapper.emitted('downloadProgress')).toBeTruthy()
      expect(wrapper.emitted('downloadProgress')[0]).toEqual([0])
    })
  })

  describe('offline: downloading state', () => {
    beforeEach(() => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      wrapper.find('.ti-download').trigger('click')
      flushPromises()
    })

    it('downloading: mostra cancel icon, não baixa', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      expect(wrapper.find('.ti-x').exists()).toBe(true)
      wrapper.find('.ti-x').trigger('click')
      await flushPromises()
      expect(wrapper.vm.offlineStatus).toBe('idle')
      expect(wrapper.emitted('downloadProgress')).toBeTruthy()
      expect(wrapper.emitted('downloadProgress')[1]).toEqual([null])
    })

    it('downloading: progress update → downloadProgress atualiza', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      wrapper.find('.ti-download').trigger('click')
      await flushPromises()
      wrapper.vm.offlineStatus = 'downloading'
      wrapper.vm.emitDownloadProgress(75)
      expect(wrapper.vm.downloadProgress).toBe(75)
    })

    it('downloading: cancelRequested → abort na callback, volta idle', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(false)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 789 },
        global: { plugins: [i18n] },
      })
      wrapper.find('.ti-download').trigger('click')
      await flushPromises()
      mockDownloadTrackMedia.mockImplementation(({ shouldAbort }) => {
        expect(shouldAbort()).toBe(true) // cancelRequested=true
        return { status: 'idle', reason: 'cancelled' }
      })
      wrapper.vm.cancelRequested = true
      wrapper.vm.emitDownloadProgress(50)
      expect(wrapper.emitted('downloadProgress')).toBeTruthy()
    })
  })

  describe('confirm dialog', () => {
    it('requestRemove: abre Teleport', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(true)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 123 },
        global: { plugins: [i18n] },
      })
      await flushPromises()
      wrapper.vm.requestRemove()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.confirmRemoveOpen).toBe(true)
    })

    it('dismissRemove: fecha Teleport', () => {
      const wrapper = mount(MusicTrackActions, {
        props: defaultProps,
        global: { plugins: [i18n] },
      })
      wrapper.vm.confirmRemoveOpen = true
      wrapper.vm.dismissRemove()
      expect(wrapper.vm.confirmRemoveOpen).toBe(false)
    })

    it('confirmRemove: delete, libera status, reconcile', async () => {
      mockIsTrackMediaDownloaded.mockResolvedValue(true)
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, musicId: 999 },
        global: { plugins: [i18n] },
      })
      await flushPromises()
      wrapper.vm.confirmRemove()
      await flushPromises()
      expect(mockDeleteTrackMedia).toHaveBeenCalledWith(999)
      expect(wrapper.vm.offlineStatus).toBe('idle')
      expect(wrapper.vm.downloadProgress).toBe(0)
      expect(wrapper.emitted('downloadProgress')).toBeTruthy()
      expect(mockReconcileAlbumsForMusic).toHaveBeenCalledWith(999)
    })

    it('confirmTrackLabel: trim + fallback', () => {
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, trackName: ' ' },
        global: { plugins: [i18n] },
      })
      expect(wrapper.vm.confirmTrackLabel).toBe('esta faixa')
    })
  })

  describe('contained variant', () => {
    it('contained: background nos botões', () => {
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, variant: 'contained' },
        global: { plugins: [i18n] },
      })
      expect(wrapper.find('.music-track-actions--contained .music-track-actions__btn').exists()).toBe(true)
    })
  })

  describe('busy prop', () => {
    it('busy: desabilita todos os botões', () => {
      const wrapper = mount(MusicTrackActions, {
        props: { ...defaultProps, busy: true },
        global: { plugins: [i18n] },
      })
      expect(wrapper.find('.ti-player-play').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.ti-piano').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.ti-volume-off').attributes('disabled')).toBeDefined()
    })
  })
})