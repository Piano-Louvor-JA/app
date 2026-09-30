// Testes AlbumHymnalCard — status, emits, progress, download controls, edition names
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

// Mock dos serviços e types
const mockAlbumCollection = {
  id: 'hymnal_test',
  name: 'Test Hymnal',
  subtitle: 'Subtitle',
  trackCount: 50,
}

const mockLibraryAlbum = {
  status: 'idle' as const,
  progress: 0,
  progressText: '25%',
  songCount: 50,
}

vi.mock('@modules/sync/types/library', () => ({
  LibraryAlbum: class {},
}))

vi.mock('@modules/albums/types/albums', () => ({
  AlbumCollection: class {},
}))

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      sync: {
        downloaded: 'Baixado',
        cancel: 'Cancelar',
        downloadOffline: 'Baixar offline',
        progress: {
          downloading: 'Baixando',
        },
        hymnal: {
          edition1996Name: 'Hinário 1996',
          edition1996Subtitle: '{count} hinos especiais',
          officialSubtitle: '{count} hinos',
        },
      },
    },
  },
})

import AlbumHymnalCard from '../AlbumHymnalCard.vue'
import type { LibraryAlbum } from '@modules/sync/types/library'
import type { AlbumCollection } from '@modules/albums/types/albums'

describe('AlbumHymnalCard', () => {
  function createWrapper(props: {
    collection: AlbumCollection
    libraryAlbum?: LibraryAlbum | null
    showDownloadControls?: boolean
  }) {
    return mount(AlbumHymnalCard, {
      props,
      global: { plugins: [i18n] },
    })
  }

  describe('computeds básicos', () => {
    it('status: libraryAlbum?.status ou idle', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'downloading' },
      })
      expect(wrapper.vm.status).toBe('downloading')
    })

    it('status: idle se libraryAlbum nulo', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: null,
      })
      expect(wrapper.vm.status).toBe('idle')
    })

    it('progress: libraryAlbum?.progress ou 0', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, progress: 75 },
      })
      expect(wrapper.vm.progress).toBe(75)
    })

    it('isDownloaded: true se status downloaded', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'downloaded' },
      })
      expect(wrapper.vm.isDownloaded).toBe(true)
    })

    it('isDownloaded: false se status não downloaded', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'idle' },
      })
      expect(wrapper.vm.isDownloaded).toBe(false)
    })
  })

  describe('displayName computado', () => {
    it('hymnal_1996: usa i18n sync.hymnal.edition1996Name', () => {
      const collection = { ...mockAlbumCollection, id: 'hymnal_1996' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.displayName).toBe('Hinário 1996')
    })

    it('outro collection: retorna collection.name', () => {
      const collection = { ...mockAlbumCollection, id: 'other_hymnal' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.displayName).toBe(collection.name)
    })
  })

  describe('subtitle computado', () => {
    it('downloading: retorna progressText', () => {
      const progressText = '25%'
      const libraryAlbum = { ...mockLibraryAlbum, status: 'downloading', progressText }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
      })
      expect(wrapper.vm.subtitle).toBe(progressText)
    })

    it('hymnal_1996 com songCount: retorna valor dinâmico', () => {
      const collection = { ...mockAlbumCollection, id: 'hymnal_1996' }
      const songCount = 100
      const libraryAlbum = { ...mockLibraryAlbum, songCount }
      const wrapper = createWrapper({ collection, libraryAlbum })
      expect(wrapper.vm.subtitle).toContain(songCount.toString())
    })

    it('outro collection com songCount: retorna valor com songCount', () => {
      const songCount = 75
      const libraryAlbum = { ...mockLibraryAlbum, songCount }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
      })
      expect(wrapper.vm.subtitle).toContain(songCount.toString())
    })

    it('sem songCount e sem trackCount: retorna collection.subtitle', () => {
      const collection = { ...mockAlbumCollection, trackCount: undefined, subtitle: 'Custom' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.subtitle).toBe(collection.subtitle)
    })

    it('sem songCount e trackCount, sem subtitle: retorna null', () => {
      const collection = { ...mockAlbumCollection, trackCount: undefined, subtitle: '' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.subtitle).toBeNull()
    })
  })

  describe('coverIcon computado', () => {
    it('hymnal_1996: ti-history', () => {
      const collection = { ...mockAlbumCollection, id: 'hymnal_1996' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.coverIcon).toBe('ti-history')
    })

    it('outro collection: ti-book-2', () => {
      const collection = { ...mockAlbumCollection, id: 'other' }
      const wrapper = createWrapper({ collection })
      expect(wrapper.vm.coverIcon).toBe('ti-book-2')
    })
  })

  describe('renderização e ações', () => {
    it('sem showDownloadControls: não mostra badge nem actions', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        showDownloadControls: false,
      })
      expect(wrapper.find('.album-hymnal-card__badge').exists()).toBe(false)
      expect(wrapper.find('.album-hymnal-card__actions').exists()).toBe(false)
    })

    it('showDownloadControls + downloaded: mostra badge', () => {
      const libraryAlbum = { ...mockLibraryAlbum, status: 'downloaded' }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__badge').exists()).toBe(true)
      expect(wrapper.find('.ti-check').exists()).toBe(true)
    })

    it('open button: emite open quando clicado', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        showDownloadControls: true,
        libraryAlbum: { ...mockLibraryAlbum, status: 'downloaded' },
      })
      wrapper.find('.album-hymnal-card__open').trigger('click')
      expect(wrapper.emitted('open')).toBeTruthy()
    })

    it('download button: emite download quando status idle', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        showDownloadControls: true,
        libraryAlbum: { ...mockLibraryAlbum, status: 'idle' },
      })
      wrapper.find('.album-hymnal-card__action--download').trigger('click')
      expect(wrapper.emitted('download')).toBeTruthy()
    })

    it('cancel button: emite cancel quando status downloading', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        showDownloadControls: true,
        libraryAlbum: { ...mockLibraryAlbum, status: 'downloading' },
      })
      wrapper.find('.album-hymnal-card__cancel').trigger('click')
      expect(wrapper.emitted('cancel')).toBeTruthy()
    })

    it('actions escondidas quando não showDownloadControls', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        showDownloadControls: false,
      })
      expect(wrapper.find('.album-hymnal-card__actions').exists()).toBe(false)
    })
  })

  describe('progress bar', () => {
    it('downloading: mostra progress e meta', () => {
      const libraryAlbum = { ...mockLibraryAlbum, status: 'downloading', progress: 50 }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__progress-meta').exists()).toBe(true)
      expect(wrapper.find('.album-hymnal-card__track').exists()).toBe(true)
      expect(wrapper.find('.album-hymnal-card__fill').attributes('style')).toContain('50%')
    })

    it('downloading: progress dinâmico', () => {
      const libraryAlbum = { ...mockLibraryAlbum, status: 'downloading', progress: 25 }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__fill').attributes('style')).toContain('25%')
    })

    it('não downloading: não mostra progress bar', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'idle' },
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__progress-meta').exists()).toBe(false)
      expect(wrapper.find('.album-hymnal-card__track').exists()).toBe(false)
    })
  })

  describe('classes condicionais', () => {
    it('album-hymnal-card--downloaded quando isDownloaded', () => {
      const libraryAlbum = { ...mockLibraryAlbum, status: 'downloaded' }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card').classes()).toContain('album-hymnal-card--downloaded')
    })

    it('cover--muted quando status idle/download e showDownloadControls', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'idle' },
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__cover').classes()).toContain('album-hymnal-card__cover--muted')
    })

    it('cover--muted falso quando status downloading', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'downloading' },
        showDownloadControls: true,
      })
      expect(wrapper.find('.album-hymnal-card__cover').classes()).not.toContain('album-hymnal-card__cover--muted')
    })

    it('cover--muted falso quando sem showDownloadControls', () => {
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum: { ...mockLibraryAlbum, status: 'idle' },
        showDownloadControls: false,
      })
      expect(wrapper.find('.album-hymnal-card__cover').classes()).not.toContain('album-hymnal-card__cover--muted')
    })
  })

  describe('edge cases', () => {
    it('libraryAlbum progress null → progress=0', () => {
      const libraryAlbum = { ...mockLibraryAlbum, progress: null }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
      })
      expect(wrapper.vm.progress).toBe(0)
    })

    it('libraryAlbum songCount null → usa trackCount', () => {
      const libraryAlbum = { ...mockLibraryAlbum, songCount: null }
      const wrapper = createWrapper({
        collection: mockAlbumCollection,
        libraryAlbum,
      })
      expect(wrapper.vm.subtitle).toBe('50 hinos')
    })

    it('libraryAlbum songCount e trackCount null → retorna subtitle', () => {
      const collection = { ...mockAlbumCollection, trackCount: undefined }
      const libraryAlbum = { ...mockLibraryAlbum, songCount: null }
      const wrapper = createWrapper({
        collection,
        libraryAlbum,
      })
      expect(wrapper.vm.subtitle).toBe('Subtitle')
    })
  })

  describe('status downloaded/error: remove e retry (157/170)', () => {
    it('downloaded: botão remove emite remove', async () => {
      const w = createWrapper({ collection: mockAlbumCollection, libraryAlbum: { ...mockLibraryAlbum, status: 'downloaded' }, showDownloadControls: true })
      const btn = w.find('.album-hymnal-card__action--remove')
      expect(btn.exists()).toBe(true)
      await btn.trigger('click')
      expect(w.emitted('remove')).toBeTruthy()
      w.unmount()
    })

    it('error: botão retry emite download', async () => {
      const w = createWrapper({ collection: mockAlbumCollection, libraryAlbum: { ...mockLibraryAlbum, status: 'error' }, showDownloadControls: true })
      const btn = w.find('.album-hymnal-card__action--retry')
      expect(btn.exists()).toBe(true)
      await btn.trigger('click')
      expect(w.emitted('download')).toBeTruthy()
      w.unmount()
    })
  })
})
