// @vitest-environment jsdom
// Cobertura AlbumCollectionCard: estados de download (idle/downloading/
// downloaded/error), custom (sem controles), progresso e ações (gaps_map3).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
    locale: { value: 'pt-BR' },
  }),
}))

import AlbumCollectionCard from '../AlbumCollectionCard.vue'
import type { AlbumCollection } from '../../types/albums'
import type { LibraryAlbum } from '@modules/sync/types/library'

const collection: AlbumCollection = {
  id: '10',
  kind: 'album',
  name: 'CD Vocacional',
  subtitle: '2024',
  coverUrl: '/covers/cd.jpg',
  trackCount: 12,
  catalogKey: 'album_10',
}

type LibStatus = 'idle' | 'downloading' | 'downloaded' | 'error'

const lib = (status: LibStatus, progress = 0): LibraryAlbum =>
  ({ id: 10, status, progress } as unknown as LibraryAlbum)

const mountCard = (over: Record<string, unknown> = {}) =>
  mount(AlbumCollectionCard, {
    props: { collection, libraryAlbum: null, showDownloadControls: true, ...over },
  })

describe('AlbumCollectionCard', () => {
  it('renderiza capa, nome, subtítulo e contagem', () => {
    const w = mountCard()
    expect(w.find('.album-collection-card__cover-img').exists()).toBe(true)
    expect(w.find('.album-collection-card__name').text()).toContain('CD Vocacional')
    expect(w.find('.album-collection-card__subtitle').text()).toContain('2024')
    expect(w.find('.album-collection-card__meta').text()).toContain('albums.trackCount')
  })

  it('sem cover mostra fallback com ícone por kind (disc vs book)', () => {
    const w = mountCard({ collection: { ...collection, coverUrl: null, kind: 'album' } })
    expect(w.find('.album-collection-card__fallback').classes()).toContain('ti-disc')
    const w2 = mountCard({ collection: { ...collection, coverUrl: null, kind: 'hymnal' } })
    expect(w2.find('.album-collection-card__fallback').classes()).toContain('ti-book')
  })

  it('idle com controles: botão de download persistente emite download', async () => {
    const w = mountCard({ libraryAlbum: lib('idle') })
    expect(w.classes()).toContain('album-collection-card--pending')
    await w.find('.album-collection-card__action').trigger('click')
    expect(w.emitted('download')).toHaveLength(1)
  })

  it('downloading: progresso visível e download vira cancel', async () => {
    const w = mountCard({ libraryAlbum: lib('downloading', 45) })
    expect(w.classes()).toContain('album-collection-card--busy')
    expect(w.find('.album-collection-card__progress-value').text()).toContain('45')
    expect(w.find('.album-collection-card__play').exists()).toBe(false)
    await w.find('.album-collection-card__action').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('download')).toBeUndefined()
  })

  it('downloaded: check visível, botão remover emite remove (com stopPropagation)', async () => {
    const w = mountCard({ libraryAlbum: lib('downloaded') })
    expect(w.classes()).toContain('album-collection-card--downloaded')
    expect(w.find('.album-collection-card__check').exists()).toBe(true)
    const remove = w.find('.album-collection-card__remove')
    expect(remove.exists()).toBe(true)
    const evt = new MouseEvent('click', { bubbles: true })
    const spy = vi.spyOn(evt, 'stopPropagation')
    remove.element.dispatchEvent(evt)
    expect(spy).toHaveBeenCalled()
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('error: botão retry emite download', async () => {
    const w = mountCard({ libraryAlbum: lib('error') })
    expect(w.find('.album-collection-card__action').classes()).toContain('album-collection-card__action--retry')
    await w.find('.album-collection-card__action').trigger('click')
    expect(w.emitted('download')).toHaveLength(1)
  })

  it('custom collection: sem controles de download mesmo com showDownloadControls', () => {
    const w = mountCard({
      collection: { ...collection, isCustom: true },
      libraryAlbum: lib('idle'),
    })
    expect(w.find('.album-collection-card__action').exists()).toBe(false)
    expect(w.find('.album-collection-card__cover--custom').exists()).toBe(true)
  })

  it('sem showDownloadControls: sem download/remove/check', () => {
    const w = mountCard({ showDownloadControls: false, libraryAlbum: lib('downloaded') })
    expect(w.find('.album-collection-card__action').exists()).toBe(false)
    expect(w.find('.album-collection-card__remove').exists()).toBe(false)
    expect(w.find('.album-collection-card__check').exists()).toBe(false)
  })

  it('clique no play do hover emite open; enquanto busy não há play', async () => {
    const w = mountCard({ libraryAlbum: lib('idle') })
    await w.find('.album-collection-card__play').trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
    const busy = mountCard({ libraryAlbum: lib('downloading') })
    expect(busy.find('.album-collection-card__play').exists()).toBe(false)
  })
})
