// @vitest-environment jsdom
// Cobertura AlbumTrackRow: play button (stop propagation, guards), botão de
// playlist, overlay de download e teclado (gaps_map3).
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
      <button class="mta-progress" @click.stop="$emit('download-progress', 80)" />
    </div>`,
  },
}))

import AlbumTrackRow from '../AlbumTrackRow.vue'
import type { AlbumTrack } from '../../types/albums'

const track: AlbumTrack = {
  musicId: 7,
  name: 'Nova bênção',
  track: 3,
  durationLabel: '4:02',
  hasInstrumental: false,
}

const mountRow = (over: Record<string, unknown> = {}) =>
  mount(AlbumTrackRow, {
    props: { track, collectionName: 'Hinário', artworkUrl: null, ...over },
  })

describe('AlbumTrackRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza número, título, coletânea e duração; sem artwork mostra ícone', () => {
    const w = mountRow()
    expect(w.find('.album-track-row__number').text()).toBe('3')
    expect(w.find('.album-track-row__title').text()).toContain('Nova bênção')
    expect(w.find('.album-track-row__collection').text()).toContain('Hinário')
    expect(w.find('.album-track-row__duration').text()).toBe('4:02')
    expect(w.find('.album-track-row__artwork img').exists()).toBe(false)
    expect(w.find('.album-track-row__artwork .ti-music').exists()).toBe(true)
  })

  it('artwork presente renderiza img e some o ícone; track null mostra traço; sem collectionName omite', () => {
    const w = mountRow({ artworkUrl: '/covers/x.jpg', track: { ...track, track: null }, collectionName: undefined })
    expect(w.find('.album-track-row__artwork img').exists()).toBe(true)
    expect(w.find('.album-track-row__number').text()).toBe('—')
    expect(w.find('.album-track-row__collection').exists()).toBe(false)
  })

  it('botão play emite sung com stop propagation', async () => {
    const w = mountRow()
    await w.find('.album-track-row__play').trigger('click')
    expect(w.emitted('sung')).toHaveLength(1)
  })

  it('botão playlist emite playlist; desabilitado quando busy', async () => {
    const w = mountRow()
    await w.find('.album-track-row__playlist').trigger('click')
    expect(w.emitted('playlist')).toHaveLength(1)
    const busy = mountRow({ busy: true })
    expect(busy.find('.album-track-row__play').attributes('disabled')).toBeDefined()
    expect(busy.find('.album-track-row__playlist').attributes('disabled')).toBeDefined()
  })

  it('clique na linha (fora dos botões) emite sung; enter/espaço também', async () => {
    const w = mountRow()
    await w.find('.album-track-row').trigger('click')
    await w.find('.album-track-row').trigger('keydown.enter')
    await w.find('.album-track-row').trigger('keydown.space')
    expect(w.emitted('sung')).toHaveLength(3)
  })

  it('busy bloqueia clique da linha', async () => {
    const w = mountRow({ busy: true })
    await w.find('.album-track-row').trigger('click')
    expect(w.emitted('sung')).toBeUndefined()
  })

  it('download em progresso: overlay visível, linha marcada e sung bloqueado', async () => {
    const w = mountRow()
    await w.find('.mta-progress').trigger('click')
    expect(w.find('.album-track-row__download-overlay').exists()).toBe(true)
    expect(w.find('.album-track-row__download-percent').text()).toContain('80')
    expect(w.classes()).toContain('album-track-row--downloading')
    await w.find('.album-track-row').trigger('click')
    expect(w.emitted('sung')).toBeUndefined()
    // play button desabilitado durante download
    expect(w.find('.album-track-row__play').attributes('disabled')).toBeDefined()
  })

  it('ações do MusicTrackActions repassam eventos', async () => {
    const w = mountRow()
    await w.find('.mta-inst').trigger('click')
    await w.find('.mta-slides').trigger('click')
    await w.find('.mta-lyric').trigger('click')
    await w.find('.mta-sung').trigger('click')
    expect(w.emitted('instrumental')).toHaveLength(1)
    expect(w.emitted('slides')).toHaveLength(1)
    expect(w.emitted('lyric')).toHaveLength(1)
    expect(w.emitted('sung')).toHaveLength(1)
  })
})
