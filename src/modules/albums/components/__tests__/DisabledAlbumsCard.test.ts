// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }),
}))
vi.mock('../../services/album-catalog', () => ({
  loadAlbumCategories: vi.fn(async () => [
    { id: 'hymnals', name: 'Hinários', collections: [
      { id: 'hymnal', kind: 'hymnal', name: 'Hinário Adventista', subtitle: '', coverUrl: null, trackCount: 610, catalogKey: 'pt_hymnal' },
      { id: 'hymnal_1996', kind: 'hymnal', name: 'Hinário Adventista - Edição 1996', subtitle: '', coverUrl: null, trackCount: 580, catalogKey: 'pt_hymnal_1996' },
    ] },
    { id: 'cds', name: 'CDs Jovem', collections: [
      { id: 77, kind: 'album', name: 'CD Jovem 2004', subtitle: '', coverUrl: null, trackCount: null, catalogKey: 'album_77' },
    ] },
  ]),
  loadCustomAlbumCategory: vi.fn(async () => null),
  findCollectionById: vi.fn(),
}))
vi.mock('../../services/album-music-search', () => ({
  loadAlbumMusicIndex: vi.fn(async () => []),
  filterAlbumMusicIndex: vi.fn(() => []),
}))

import DisabledAlbumsCard from '../DisabledAlbumsCard.vue'
import { loadDisabledAlbums } from '../../services/disabled-albums'

describe('DisabledAlbumsCard (Configurações → Mídia & Player)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('lista os álbuns oficiais com chave ligada; desligar desativa e persiste', async () => {
    const w = mount(DisabledAlbumsCard)
    await flushPromises()
    const rows = w.findAll('[data-test="disabled-album-row"]')
    expect(rows.map((row) => row.attributes('data-key'))).toEqual(['hymnal', 'hymnal_1996', '77'])
    const antigo = rows[1]!
    expect(antigo.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    await antigo.get('[role="switch"]').trigger('click')
    expect(loadDisabledAlbums()).toEqual(['hymnal_1996'])
    expect(w.get('[data-test="disabled-album-row"][data-key="hymnal_1996"] [role="switch"]').attributes('aria-checked')).toBe('false')
    expect(w.text()).toContain('albums.disabledAlbums.count:{"count":1}')
  })

  it('filtra pelo nome', async () => {
    const w = mount(DisabledAlbumsCard)
    await flushPromises()
    await w.get('input[type="search"]').setValue('1996')
    expect(w.findAll('[data-test="disabled-album-row"]').map((row) => row.attributes('data-key'))).toEqual(['hymnal_1996'])
  })
})
