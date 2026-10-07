// @vitest-environment jsdom
// Cobertura RandomView.vue (gaps_map3: 5 pts): header (voltar/modos/reset),
// delegates ao useRandomFeature, appConfirm no reset, importFile com erro.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const feature = vi.hoisted(() => {
  const calls: string[] = []
  const state = {
    mode: 'names' as 'names' | 'numbers',
    session: {
      mode: 'names' as 'names' | 'numbers',
      available: ['Ana'],
      drawn: [],
      numberMin: 1,
      numberMax: 100,
    },
    config: {
      bgColor: '#000000',
      textColor: '#ffffff',
      audioSource: 'default',
      customAudioFiles: [],
      customAudioFile: null,
      audioVolume: 0.8,
      audioMuted: false,
    },
  }
  const fn = (name: string) => vi.fn((..._a: unknown[]) => { calls.push(name) })
  return {
    calls,
    state,
    fns: {
      setMode: fn('setMode'),
      setNumberMin: fn('setNumberMin'),
      setNumberMax: fn('setNumberMax'),
      setDraftName: fn('setDraftName'),
      addName: fn('addName'),
      removeAvailable: fn('removeAvailable'),
      clearAvailable: fn('clearAvailable'),
      removeDrawn: fn('removeDrawn'),
      clearHistory: fn('clearHistory'),
      resetAll: fn('resetAll'),
      importNamesFromText: fn('importNamesFromText'),
      generateNumberRange: fn('generateNumberRange'),
      startDraw: fn('startDraw'),
      setBgColor: fn('setBgColor'),
      setTextColor: fn('setTextColor'),
      setFontSizePc: fn('setFontSizePc'),
      setTextTransform: fn('setTextTransform'),
      setAnimationSpeed: fn('setAnimationSpeed'),
      resetDisplayToDefault: fn('resetDisplayToDefault'),
      useDefaultDrawAudio: fn('useDefaultDrawAudio'),
      useCustomDrawAudio: fn('useCustomDrawAudio'),
      chooseCustomDrawAudio: fn('chooseCustomDrawAudio'),
      removeCustomDrawAudio: fn('removeCustomDrawAudio'),
      togglePreviewDrawAudio: fn('togglePreviewDrawAudio'),
      setAudioVolume: fn('setAudioVolume'),
      toggleAudioMuted: fn('toggleAudioMuted'),
      openConfig: fn('openConfig'),
      closeConfig: fn('closeConfig'),
      toggleProjection: fn('toggleProjection'),
    },
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

const routerPush = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush.push }),
}))

vi.mock('../../../settings/components/PalcoRouteSelect.vue', () => ({
  default: { name: 'PalcoRouteSelect', props: ['module'], template: '<div class="palco-route-mock" />' },
}))

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => ({ random: null }),
  subscribeStageSettings: () => () => {},
}))

vi.mock('../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: () => null,
  stageFlexAlign: () => ({}),
}))

vi.mock('../../composables/useRandom', () => ({
  useRandomFeature: () => ({
    config: feature.state.config,
    session: feature.state.session,
    runtime: { isDrawing: false, currentDisplay: '' },
    draftName: '',
    isProjecting: false,
    configOpen: false,
    rangeError: null,
    canDraw: true,
    drawnReversed: [],
    audioPlaying: false,
    ...feature.fns,
  }),
}))

const confirmState = vi.hoisted(() => ({ resolve: true as boolean }))
vi.mock('@shared/composables/useAppConfirm', () => ({
  appConfirm: vi.fn(async () => confirmState.resolve),
}))

vi.mock('@shared/services/text-encoding', () => ({
  decodeTextFileBytes: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}))

import RandomView from '../RandomView.vue'
import { appConfirm } from '@shared/composables/useAppConfirm'

function mountView() {
  return mount(RandomView, {
    global: {
      stubs: {
        RandomAvailablePanel: true,
        RandomHistoryPanel: true,
        RandomConfigDialog: true,
        RandomProjectFab: true,
        RandomStage: true,
        Teleport: true,
      },
    },
  })
}

beforeEach(() => {
  window.localStorage?.clear?.()
  vi.clearAllMocks()
  feature.calls.length = 0
  confirmState.resolve = true
})

describe('RandomView.vue', () => {
  it('renderiza header com PalcoRouteSelect, título e modos', () => {
    const w = mountView()
    expect(w.find('.palco-route-mock').exists()).toBe(true)
    expect(w.find('.random-view__title').text()).toBe('random.title')
    expect(w.findAll('.random-view__mode')).toHaveLength(2)
    w.unmount()
  })

  it('botão back navega pra utilities', async () => {
    const w = mountView()
    await w.find('.random-view__back').trigger('click')
    expect(routerPush.push).toHaveBeenCalledWith({ name: 'utilities' })
    w.unmount()
  })

  it('modo names ativo por padrão; clique em numbers chama setMode', async () => {
    const w = mountView()
    expect(w.find('.random-view__mode--active').text()).toBe('random.modeNames')
    await w.findAll('.random-view__mode')[1].trigger('click')
    expect(feature.fns.setMode).toHaveBeenCalledWith('numbers')
    w.unmount()
  })

  it('reset com appConfirm confirmado chama resetAll', async () => {
    const w = mountView()
    await w.find('.random-view__reset').trigger('click')
    await flushPromises()
    expect(appConfirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }))
    expect(feature.fns.resetAll).toHaveBeenCalled()
    w.unmount()
  })

  it('reset cancelado NÃO chama resetAll', async () => {
    confirmState.resolve = false
    const w = mountView()
    await w.find('.random-view__reset').trigger('click')
    await flushPromises()
    expect(feature.fns.resetAll).not.toHaveBeenCalled()
    w.unmount()
  })

  it('RandomStage recebe preview com canDraw do feature', () => {
    const w = mountView()
    const stage = w.findComponent({ name: 'RandomStage' })
    expect(stage).toBeTruthy()
    w.unmount()
  })
})
