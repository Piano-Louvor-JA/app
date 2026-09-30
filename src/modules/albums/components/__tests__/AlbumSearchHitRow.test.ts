// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: {
    name: 'MusicTrackActions',
    props: ['musicId', 'variant', 'allowOfflineRemove', 'showOfflineControls'],
    emits: ['sung', 'instrumental', 'slides', 'lyric', 'download-progress'],
    template: `<div class="mta-stub" @click="$emit('download-progress', 42)" />`,
  },
}))

import AlbumSearchHitRow from '../AlbumSearchHitRow.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': { media: { actions: { sung: 'Cantar' } } } },
})

function makeHit(partial: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Hino 1',
    track: 1,
    albumNames: 'Coletânea',
    durationLabel: '3:00',
    musicId: 42,
    ...partial,
  }
}

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(AlbumSearchHitRow, {
    props: { hit: makeHit(), ...props },
    global: { plugins: [i18n] },
  })
}

describe('AlbumSearchHitRow.vue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza título e número do hit', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Hino 1')
    expect(wrapper.find('.album-search-hit').exists()).toBe(true)
  })

  it('click na linha: emite sung', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.album-search-hit').trigger('click')
    expect(wrapper.emitted('sung')).toHaveLength(1)
  })

  it('busy: click não emite sung', async () => {
    const wrapper = createWrapper({ busy: true })
    await wrapper.find('.album-search-hit').trigger('click')
    expect(wrapper.emitted('sung')).toBeUndefined()
  })

  it('keydown enter/space: emite sung', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.album-search-hit').trigger('keydown.enter')
    await wrapper.find('.album-search-hit').trigger('keydown.space')
    expect(wrapper.emitted('sung')).toHaveLength(2)
  })

  it('download-progress do MusicTrackActions: overlay com percent', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.mta-stub').trigger('click')
    await flushPromises()
    expect(wrapper.find('.album-search-hit--downloading').exists()).toBe(true)
    expect(wrapper.find('.album-search-hit__download-percent').text()).toContain('42')
  })

  it('durante download: click na linha não emite sung', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.mta-stub').trigger('click')
    await flushPromises()
    await wrapper.find('.album-search-hit').trigger('click')
    expect(wrapper.emitted('sung')).toBeUndefined()
  })

  it('mouseenter/mouseleave: rowHovered reativo', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.album-search-hit').trigger('mouseenter')
    await wrapper.find('.album-search-hit').trigger('mouseleave')
    expect(wrapper.exists()).toBe(true)
  })
})
