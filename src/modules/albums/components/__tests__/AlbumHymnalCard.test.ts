// @vitest-environment jsdom
// Cobertura AlbumHymnalCard: estados idle/downloading/downloaded/error, edição
// 1996 (nome/subtítulo/ícone), contagem de hinos e ações (gaps_map3).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
    locale: { value: 'pt-BR' },
  }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card-stub"><slot /></div>' },
}))

import AlbumHymnalCard from '../AlbumHymnalCard.vue'
import type { AlbumCollection } from '../../types/albums'
import type { LibraryAlbum } from '@modules/sync/types/library'

const collection: AlbumCollection = {
  id: 'pt_hymnal',
  kind: 'hymnal',
  name: 'Hinário Adventista',
  subtitle: 'Oficial',
  coverUrl: null,
  trackCount: 700,
  catalogKey: 'pt_hymnal',
}

const lib = (over: Record<string, unknown> = {}): LibraryAlbum =>
  ({ id: 'pt_hymnal', status: 'idle', progress: 0, ...over } as unknown as LibraryAlbum)

const mountCard = (over: Record<string, unknown> = {}) =>
  mount(AlbumHymnalCard, {
    props: { collection, libraryAlbum: null, showDownloadControls: true, ...over },
  })

describe('AlbumHymnalCard', () => {
  it('idle sem library: nome do catálogo, subtítulo do catálogo, ícone book, botão baixar', () => {
    const w = mountCard({ libraryAlbum: null })
    expect(w.find('.album-hymnal-card__name').text()).toContain('Hinário Adventista')
    // trackCount do catálogo vira subtítulo oficial com contagem
    expect(w.find('.album-hymnal-card__subtitle').text()).toContain('sync.hymnal.officialSubtitle')
    expect(w.find('.album-hymnal-card__fallback-icon').classes()).toContain('ti-book-2')
    const dl = w.find('.album-hymnal-card__action--download')
    expect(dl.exists()).toBe(true)
    expect(dl.text()).toContain('sync.downloadOffline')
  })

  it('idle com songCount na library: subtítulo oficial com contagem', () => {
    const w = mountCard({ libraryAlbum: lib({ songCount: 690 }) })
    expect(w.find('.album-hymnal-card__subtitle').text()).toContain('sync.hymnal.officialSubtitle')
    expect(w.find('.album-hymnal-card__subtitle').text()).toContain('690')
  })

  it('1996: nome/subtítulo/ícone da edição 1996 e contagem própria', () => {
    const w = mountCard({
      collection: { ...collection, id: 'hymnal_1996', name: 'Hinário 1996', trackCount: 480 },
      libraryAlbum: lib({ songCount: 480 }),
    })
    expect(w.find('.album-hymnal-card__name').text()).toContain('sync.hymnal.edition1996Name')
    expect(w.find('.album-hymnal-card__subtitle').text()).toContain('sync.hymnal.edition1996Subtitle')
    expect(w.find('.album-hymnal-card__fallback-icon').classes()).toContain('ti-history')
  })

  it('downloading: progresso + % visíveis, cancel disponível e emite cancel', async () => {
    const w = mountCard({ libraryAlbum: lib({ status: 'downloading', progress: 30 }) })
    expect(w.find('.album-hymnal-card__progress-meta').exists()).toBe(true)
    expect(w.find('.album-hymnal-card__progress-meta').text()).toContain('30')
    const cancel = w.find('.album-hymnal-card__cancel')
    expect(cancel.exists()).toBe(true)
    await cancel.trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('downloaded com controles: badge e botão remover emitem nada além de remove', async () => {
    const w = mountCard({ libraryAlbum: lib({ status: 'downloaded' }) })
    expect(w.find('.album-hymnal-card__badge').exists()).toBe(true)
    expect(w.classes()).toContain('album-hymnal-card--downloaded')
    await w.find('.album-hymnal-card__action--remove').trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('error: botão retry emite download', async () => {
    const w = mountCard({ libraryAlbum: lib({ status: 'error' }) })
    await w.find('.album-hymnal-card__action--retry').trigger('click')
    expect(w.emitted('download')).toHaveLength(1)
  })

  it('sem showDownloadControls: sem badge nem ações', () => {
    const w = mountCard({ showDownloadControls: false, libraryAlbum: lib({ status: 'downloaded' }) })
    expect(w.find('.album-hymnal-card__badge').exists()).toBe(false)
    expect(w.find('.album-hymnal-card__actions').exists()).toBe(false)
  })

  it('clique no card emite open', async () => {
    const w = mountCard()
    await w.find('.album-hymnal-card__open').trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })

  it('gaps: sem library/trackCount/subtitle — fallbacks do progress e subtitle', () => {
    const w = mountCard({
      libraryAlbum: null,
      collection: { ...collection, trackCount: undefined, subtitle: undefined },
    })
    expect(w.find('.album-hymnal-card__subtitle').exists()).toBe(false)
    w.unmount()
    const w2 = mountCard({
      libraryAlbum: null,
      collection: { ...collection, trackCount: undefined, subtitle: 'Edição especial' },
    })
    expect(w2.find('.album-hymnal-card__subtitle').text()).toContain('Edição especial')
    w2.unmount()
    // progress undefined → ?? 0 (br 26) + status undefined → ?? idle (br 25)
    const w3 = mountCard({ libraryAlbum: lib({ status: undefined, progress: undefined }) })
    expect(w3.find('.album-hymnal-card__action--download').exists()).toBe(true)
    w3.unmount()
  })

  it('gaps2: idle com library clica baixar (144); error retry cobre 167; progress null (26)', () => {
    const w = mountCard({ libraryAlbum: lib({ status: 'idle', progress: 0 }) })
    const dl = w.find('.album-hymnal-card__action--download')
    expect(dl.exists()).toBe(true)
    dl.trigger('click')
    expect(w.emitted('download')).toBeTruthy()
    w.unmount()
    const w2 = mountCard({ libraryAlbum: lib({ status: 'error', progress: 0 }) })
    expect(w2.find('.album-hymnal-card__action--retry').exists()).toBe(true)
    w2.unmount()
    const w3 = mountCard({ libraryAlbum: lib({ status: 'idle', progress: null }) })
    expect(w3.find('.album-hymnal-card__action--download').exists()).toBe(true)
    w3.unmount()
  })
})
