// @vitest-environment jsdom
// Cobertura MediaPlayerPill: transport, seek/volume inputs, menus de modo/volume,
// guards de projeção e toggles (gaps_map3: fns 205/218/268, brs de open/close).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string) => k,
    locale: { value: 'pt-BR' },
  }),
}))

vi.mock('@shared/components/MonitorTargetSelect.vue', () => ({
  default: { template: '<div class="mts-stub" />' },
}))

import MediaPlayerPill from '../MediaPlayerPill.vue'

function makeProps(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Hino 1',
    subtitle: 'CC',
    isPlaying: false,
    hasAudio: true,
    hasInstrumental: true,
    mode: 'audio' as const,
    currentTimeLabel: '00:10',
    durationLabel: '03:00',
    progressRatio: 0.5,
    volume: 0.7,
    projecting: false,
    playlistOpen: true,
    audioOnTv: false,
    ...over,
  }
}

async function mountPill(over: Partial<Record<string, unknown>> = {}) {
  const w = mount(MediaPlayerPill, { props: makeProps(over) })
  await flush()
  return w
}
const flush = () => Promise.resolve()

describe('MediaPlayerPill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('renderiza título/sublabel e botões de transport; play emite togglePlay', async () => {
    const w = await mountPill()
    expect(w.find('.media-player-pill__title').text()).toBe('Hino 1')
    expect(w.find('.media-player-pill__subtitle').text()).toBe('CC')
    const btns = w.findAll('button')
    await btns[0]!.trigger('click')
    expect(w.emitted('previousSlide')).toHaveLength(1)
    // play (tem audio)
    await w.find('.media-player-pill__play').trigger('click')
    expect(w.emitted('togglePlay')).toHaveLength(1)
  })

  it('play desabilitado sem áudio; timeline some sem áudio', async () => {
    const w = await mountPill({ hasAudio: false })
    expect(w.find('.media-player-pill__play').attributes('disabled')).toBeDefined()
    expect(w.find('.media-player-pill__timeline').exists()).toBe(false)
  })

  it('next slide emite nextSlide', async () => {
    const w = await mountPill()
    const btns = w.findAll('.media-player-pill__icon-btn')
    // primeiro icon-btn é "previous"; depois play; depois "next"
    await w.findAll('button').filter((b) => b.attributes('aria-label') === 'media.nextSlide')[0]!.trigger('click')
    expect(w.emitted('nextSlide')).toHaveLength(1)
    void btns
  })

  it('seek input emite seekRatio com fração', async () => {
    const w = await mountPill()
    const seek = w.find('.media-player-pill__seek')
    seek.element.value = '40'
    await seek.trigger('input')
    expect(w.emitted('seekRatio')![0]).toEqual([0.4])
  })

  it('menu de volume: abre/fecha e emite update:volume', async () => {
    const w = await mountPill()
    expect(w.find('.media-player-pill__volume-pop').exists()).toBe(false)
    await w.findAll('button').filter((b) => b.attributes('aria-label') === 'media.volume')[0]!.trigger('click')
    expect(w.find('.media-player-pill__volume-pop').exists()).toBe(true)
    const range = w.find('.media-player-pill__volume-pop input[type=range]')
    range.element.value = '30'
    await range.trigger('input')
    expect(w.emitted('update:volume')![0]).toEqual([0.3])
    // fecha de novo
    await w.findAll('button').filter((b) => b.attributes('aria-label') === 'media.volume')[0]!.trigger('click')
    expect(w.find('.media-player-pill__volume-pop').exists()).toBe(false)
  })

  it('menu de modo: abre, emite update:mode por item e seleciona ativo', async () => {
    const w = await mountPill()
    await w
      .findAll('button')
      .filter((b) => b.attributes('aria-label') === 'media.audioType')[0]!
      .trigger('click')
    expect(w.find('.media-player-pill__mode-pop').exists()).toBe(true)
    const items = w.findAll('[role=menuitem]')
    expect(items.length).toBe(3)
    await items[1]!.trigger('click')
    expect(w.emitted('update:mode')![0]).toEqual(['instrumental'])
    // menu fechou após seleção
    expect(w.find('.media-player-pill__mode-pop').exists()).toBe(false)
  })

  it('item instrumental desabilitado sem hasInstrumental', async () => {
    const w = await mountPill({ hasInstrumental: false })
    await w
      .findAll('button')
      .filter((b) => b.attributes('aria-label') === 'media.audioType')[0]!
      .trigger('click')
    const items = w.findAll('[role=menuitem]')
    expect(items[1]!.attributes('disabled')).toBeDefined()
  })

  it('toggleProjection bloqueado sem tela selecionada (disabled) e liberado projetando', async () => {
    const w1 = await mountPill({ projecting: false })
    const btn1 = w1
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '').includes('monitors.projectNeedsScreens'))[0]!
    expect(btn1.attributes('disabled')).toBeDefined()
    const w2 = await mountPill({ projecting: true })
    const btn2 = w2
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '') === 'media.clearProjection')[0]!
    expect(btn2.attributes('disabled')).toBeUndefined()
    await btn2.trigger('click')
    expect(w2.emitted('toggleProjection')).toHaveLength(1)
  })

  it('audioOnTv, fullscreen e playlist emitem seus eventos', async () => {
    const w = await mountPill()
    await w
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '') === 'media.audioOnTv')[0]!
      .trigger('click')
    expect(w.emitted('toggleAudioOnTv')).toHaveLength(1)
    await w
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '') === 'media.fullscreen')[0]!
      .trigger('click')
    expect(w.emitted('toggleFullscreen')).toHaveLength(1)
    await w
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '') === 'media.playlist')[0]!
      .trigger('click')
    expect(w.emitted('togglePlaylist')).toHaveLength(1)
  })

  it('projeção liberada quando o store tem targets selecionados', async () => {
    const displayMod = await import('@modules/settings/services/display-service')
    vi.spyOn(displayMod, 'listSystemDisplays').mockResolvedValue([
      {
        id: 77,
        label: 'Monitor 2',
        isPrimary: false,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
      },
    ])
    const { useProjectionStore } = await import('@modules/settings/stores/useProjectionStore')
    const store = useProjectionStore()
    await store.refreshDisplays()
    store.applySettings({ ...store.settings, targetDisplayIds: [77] } as never)
    expect(store.hasSelectedAudienceTargets).toBe(true)
    const w = await mountPill({ projecting: false })
    const btn = w
      .findAll('button')
      .filter((b) => (b.attributes('aria-label') ?? '') === 'media.project')[0]!
    expect(btn).toBeDefined()
    expect(btn.attributes('disabled')).toBeUndefined()
  })
})
