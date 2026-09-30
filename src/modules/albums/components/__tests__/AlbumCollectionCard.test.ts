// @vitest-environment jsdom
// AlbumCollectionCard — status computeds, persistent download, open/download/cancel/remove
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

import AlbumCollectionCard from '../AlbumCollectionCard.vue'
import type { AlbumCollection } from '../../types/albums'
import type { LibraryAlbum } from '@modules/sync/types/library'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      sync: {
        progress: { downloading: 'Baixando' },
        downloaded: 'Baixado',
        cancel: 'Cancelar',
        retry: 'Tentar de novo',
        remove: 'Remover',
        downloadOffline: 'Baixar',
        removeOffline: 'Remover',
      },
      albums: { openCollection: 'Abrir {name}' },
    },
  },
})

const collection = {
  id: 'col1',
  name: 'Coletânea A',
  trackCount: 10,
  coverUrl: 'data:image/png;base64,CAP',
} as unknown as AlbumCollection

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(AlbumCollectionCard, {
    props: { collection, ...props },
    global: { plugins: [i18n] },
  })
}

describe('AlbumCollectionCard', () => {
  it('idle com download controls: mostra botão baixar, classe --pending', () => {
    const wrapper = createWrapper({ showDownloadControls: true })
    expect(wrapper.find('.album-collection-card').classes()).toContain('album-collection-card--pending')
    expect(wrapper.find('.album-collection-card__action').exists()).toBe(true)
  })

  it('custom collection: sem download persistente (nada a baixar)', () => {
    const wrapper = createWrapper({
      showDownloadControls: true,
      collection: { ...collection, isCustom: true },
    })
    expect(wrapper.find('.album-collection-card').classes()).not.toContain('album-collection-card--pending')
  })

  it('downloaded: classe --downloaded, remove habilitado', () => {
    const wrapper = createWrapper({
      showDownloadControls: true,
      libraryAlbum: { status: 'downloaded', progress: 100 } as LibraryAlbum,
    })
    expect(wrapper.find('.album-collection-card').classes()).toContain('album-collection-card--downloaded')
  })

  it('downloading: classe --busy, clique no download emite cancel', async () => {
    const wrapper = createWrapper({
      showDownloadControls: true,
      libraryAlbum: { status: 'downloading', progress: 40, progressText: '40%' } as LibraryAlbum,
    })
    expect(wrapper.find('.album-collection-card').classes()).toContain('album-collection-card--busy')
    const btn = wrapper.find('.album-collection-card__action')
    expect(btn.attributes('aria-label')).toBe('Cancelar')
    await btn.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('download')).toBeFalsy()
  })

  it('idle: clique no download emite download', async () => {
    const wrapper = createWrapper({ showDownloadControls: true })
    const btn = wrapper.find('.album-collection-card__action')
    await btn.trigger('click')
    expect(wrapper.emitted('download')).toBeTruthy()
  })

  it('remove: só emite quando downloaded', async () => {
    const done = createWrapper({
      showDownloadControls: true,
      libraryAlbum: { status: 'downloaded', progress: 100 } as LibraryAlbum,
    })
    const doneRemove = done.find('.album-collection-card__remove')
    expect(doneRemove.exists()).toBe(true)
    await doneRemove.trigger('click')
    expect(done.emitted('remove')).toBeTruthy()

    const idle = createWrapper({ showDownloadControls: true })
    // idle: sem botão remove (só aparece quando canRemove)
    expect(idle.find('.album-collection-card__remove').exists()).toBe(false)
  })

  it('open: emite open', async () => {
    const wrapper = createWrapper()
    // primeiro elemento clicável do card (article click → open)
    const play = wrapper.find('.album-collection-card__play')
    expect(play.exists()).toBe(true)
    await play.trigger('click')
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('capa: usa coverUrl da collection', () => {
    const wrapper = createWrapper()
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,CAP')
  })

  it('sem download controls: classe --pending ausente', () => {
    const wrapper = createWrapper({ showDownloadControls: false })
    expect(wrapper.find('.album-collection-card').classes()).not.toContain('album-collection-card--pending')
  })
})
