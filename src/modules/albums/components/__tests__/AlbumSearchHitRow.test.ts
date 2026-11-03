// @vitest-environment jsdom
// Cobertura AlbumSearchHitRow: cliques (guard busy/downloading), overlays de
// download, teclado e repasse de eventos do MusicTrackActions (gaps_map3).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: {
    name: 'MusicTrackActions',
    props: ['musicId', 'trackName', 'hasInstrumental', 'busy', 'rowHovered', 'variant'],
    emits: ['sung', 'instrumental', 'slides', 'lyric', 'download-progress'],
    template: `<div class="mta-stub">
      <button class="mta-sung" @click.stop="$emit('sung')" />
      <button class="mta-inst" @click.stop="$emit('instrumental')" />
      <button class="mta-slides" @click.stop="$emit('slides')" />
      <button class="mta-lyric" @click.stop="$emit('lyric')" />
      <button class="mta-progress" @click.stop="$emit('download-progress', 55)" />
    </div>`,
  },
}))

import AlbumSearchHitRow from '../AlbumSearchHitRow.vue'
import type { AlbumSearchHit } from '../../types/albums'

const hit: AlbumSearchHit = {
  musicId: 42,
  name: 'Hino Sagrado',
  track: 12,
  durationLabel: '3:10',
  hasInstrumental: true,
  albumNames: 'Hinário Adventista',
  displayTitle: 'Hino Sagrado',
  isHymnal: true,
  hymnalTracks: [12],
}

const mountRow = (over: Record<string, unknown> = {}) =>
  mount(AlbumSearchHitRow, { props: { hit, ...over } })

describe('AlbumSearchHitRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza número do hinário, título, álbum e duração', () => {
    const w = mountRow()
    expect(w.find('.album-search-hit__number').text()).toBe('12')
    expect(w.find('.album-search-hit__title').text()).toContain('Hino Sagrado')
    expect(w.find('.album-search-hit__subtitle').text()).toContain('Hinário Adventista')
    expect(w.find('.album-search-hit__duration').text()).toBe('3:10')
  })

  it('esconde número quando não é hinário ou não tem track', () => {
    const w = mountRow({ hit: { ...hit, isHymnal: false, track: null } })
    expect(w.find('.album-search-hit__number').exists()).toBe(false)
  })

  it('clique na linha emite sung', async () => {
    const w = mountRow()
    await w.find('.album-search-hit').trigger('click')
    expect(w.emitted('sung')).toHaveLength(1)
  })

  it('botão playlist emite playlist sem disparar sung e desabilita ocupado', async () => {
    const w = mountRow()
    const button = w.find('.album-search-hit__playlist')
    expect(button.attributes('aria-label')).toBe('common.addToPlaylist')
    expect(button.find('.ti-playlist-add').exists()).toBe(true)
    await button.trigger('click')
    expect(w.emitted('playlist')).toHaveLength(1)
    expect(w.emitted('sung')).toBeUndefined()
    expect(mountRow({ busy: true }).find('.album-search-hit__playlist').attributes('disabled')).toBeDefined()
  })

  it('enter e espaço no teclado emitem sung', async () => {
    const w = mountRow()
    await w.find('.album-search-hit').trigger('keydown.enter')
    await w.find('.album-search-hit').trigger('keydown.space')
    expect(w.emitted('sung')).toHaveLength(2)
  })

  it('guard: busy não emite sung no clique da linha', async () => {
    const w = mountRow({ busy: true })
    await w.find('.album-search-hit').trigger('click')
    expect(w.emitted('sung')).toBeUndefined()
  })

  it('overlay de download aparece durante progresso e bloqueia sung', async () => {
    const w = mountRow()
    await w.find('.mta-progress').trigger('click')
    expect(w.find('.album-search-hit__download-overlay').exists()).toBe(true)
    expect(w.find('.album-search-hit__download-percent').text()).toContain('55')
    expect(w.classes()).toContain('album-search-hit--downloading')
    await w.find('.album-search-hit').trigger('click')
    expect(w.emitted('sung')).toBeUndefined()
  })

  it('ações do MusicTrackActions repassam eventos', async () => {
    const w = mountRow()
    await w.find('.mta-sung').trigger('click')
    await w.find('.mta-inst').trigger('click')
    await w.find('.mta-slides').trigger('click')
    await w.find('.mta-lyric').trigger('click')
    expect(w.emitted('sung')).toHaveLength(1)
    expect(w.emitted('instrumental')).toHaveLength(1)
    expect(w.emitted('slides')).toHaveLength(1)
    expect(w.emitted('lyric')).toHaveLength(1)
  })

  it('hover atualiza rowHovered repassado ao MusicTrackActions', async () => {
    const w = mountRow()
    expect(w.findComponent({ name: 'MusicTrackActions' }).props('rowHovered')).toBe(false)
    await w.find('.album-search-hit').trigger('mouseenter')
    expect(w.findComponent({ name: 'MusicTrackActions' }).props('rowHovered')).toBe(true)
    await w.find('.album-search-hit').trigger('mouseleave')
    expect(w.findComponent({ name: 'MusicTrackActions' }).props('rowHovered')).toBe(false)
  })
})

it('adds to a playlist without starting playback from the row', async () => {
  const wrapper = mountRow()
  await wrapper.get('.album-search-hit__playlist').trigger('click')
  expect(wrapper.emitted('playlist')).toHaveLength(1)
  expect(wrapper.emitted('sung')).toBeUndefined()
})

it('marks saved playlist songs and disables adding them again', async () => {
  const wrapper = mountRow({ prominentPlaylist: true })
  const button = wrapper.get<HTMLButtonElement>('.album-search-hit__playlist--prominent')
  expect(button.element.disabled).toBe(false)
  await wrapper.setProps({ alreadyAdded: true })
  expect(wrapper.classes()).toContain('album-search-hit--added')
  expect(button.element.disabled).toBe(true)
  expect(button.attributes('title')).toBe('albums.playlists.inPlaylist')
  expect(button.find('.ti-check').exists()).toBe(true)
  await button.trigger('click')
  expect(wrapper.emitted('playlist')).toBeUndefined()
  wrapper.unmount()
  const reopened = mountRow({ prominentPlaylist: true, alreadyAdded: true })
  expect(reopened.get<HTMLButtonElement>('.album-search-hit__playlist--prominent').element.disabled).toBe(true)
})


it('does not play from row clicks or keyboard in the playlist search modal', async () => {
  const wrapper = mountRow({ prominentPlaylist: true })
  const row = wrapper.get('.album-search-hit')
  await row.trigger('click')
  await row.trigger('keydown', { key: 'Enter' })
  await row.trigger('keydown', { key: ' ' })
  expect(wrapper.emitted('sung')).toBeUndefined()
  expect(row.attributes('tabindex')).toBeUndefined()
  await wrapper.get('.mta-sung').trigger('click')
  expect(wrapper.emitted('sung')).toHaveLength(1)
})
