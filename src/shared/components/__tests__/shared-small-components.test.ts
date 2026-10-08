// @vitest-environment jsdom
// Cobertura componentes menores shared (gaps): AppConfirm (props/danger),
// ModulePlaceholder (i18n), UiZoomControls (zoom in/out/disable),
// InAppProjectionOverlay (close, ESC guards, classe root, hint), ProjectionHost
// (roteamento por query module/layout).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

const routeQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
}))

const zoomApi = {
  zoomPercent: 100,
  canZoomIn: true,
  canZoomOut: true,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}

vi.mock('@shared/composables/useUiZoom', async () => {
  const { ref } = await import('vue')
  return {
    useUiZoom: () => ({
      zoomPercent: ref(zoomApi.zoomPercent),
      canZoomIn: ref(zoomApi.canZoomIn),
      canZoomOut: ref(zoomApi.canZoomOut),
      zoomIn: zoomApi.zoomIn,
      zoomOut: zoomApi.zoomOut,
    }),
  }
})

vi.mock('@modules/settings/components/StagePaletteButton.vue', () => ({
  default: { template: '<div class="stage-palette-stub" />' },
}))

// ProjectionHost depende de views pesadas → stub todas
vi.mock('@modules/bible/views/BibleProjectionView.vue', () => ({
  default: { template: '<div class="v-bible" />' },
}))
vi.mock('@modules/clock/views/ClockProjectionView.vue', () => ({
  default: { template: '<div class="v-clock" />' },
}))
vi.mock('@modules/countdown/views/CountdownProjectionView.vue', () => ({
  default: { template: '<div class="v-countdown" />' },
}))
vi.mock('@modules/liturgy/views/LiturgyWebProjectionView.vue', () => ({
  default: { template: '<div class="v-liturgy-web" />' },
}))
vi.mock('@modules/media/views/MediaProjectionView.vue', () => ({
  default: { template: '<div class="v-media" />' },
}))
vi.mock('@modules/media/views/MediaReturnProjectionView.vue', () => ({
  default: { template: '<div class="v-media-return" />' },
}))
vi.mock('@modules/random/views/RandomProjectionView.vue', () => ({
  default: { template: '<div class="v-random" />' },
}))
vi.mock('@modules/timer/views/TimerProjectionView.vue', () => ({
  default: { template: '<div class="v-timer" />' },
}))

import AppConfirm from '../AppConfirm.vue'
import InAppProjectionOverlay from '../InAppProjectionOverlay.vue'
import ModulePlaceholder from '../ModulePlaceholder.vue'
import ProjectionHost from '../ProjectionHost.vue'
import UiZoomControls from '../UiZoomControls.vue'

describe('AppConfirm', () => {
  it('não renderiza quando open=false', () => {
    const w = mount(AppConfirm, {
      props: {
        open: false,
        title: 'T',
        message: 'M',
        confirmLabel: 'OK',
        cancelLabel: 'Não',
      },
      global: { stubs: { teleport: true } },
    })
    expect(w.find('.app-confirm').exists()).toBe(false)
  })

  it('renderiza textos e emite cancel/confirm; danger aplica classe', async () => {
    const w = mount(AppConfirm, {
      props: {
        open: true,
        title: 'Titulo',
        message: 'Mensagem',
        confirmLabel: 'OK',
        cancelLabel: 'Não',
        danger: true,
      },
      global: { stubs: { teleport: true } },
    })
    expect(w.find('.app-confirm__title').text()).toBe('Titulo')
    expect(w.find('.app-confirm__message').text()).toBe('Mensagem')
    expect(w.find('.app-confirm__btn--danger').exists()).toBe(true)
    await w.find('.app-confirm__backdrop').trigger('click')
    await w.findAll('.app-confirm__btn')[0]!.trigger('click')
    await w.findAll('.app-confirm__btn')[1]!.trigger('click')
    expect(w.emitted('cancel')).toHaveLength(2)
    expect(w.emitted('confirm')).toHaveLength(1)
  })
})

describe('ModulePlaceholder', () => {
  it('renderiza título via i18n e coming soon', () => {
    const w = mount(ModulePlaceholder, { props: { titleKey: 'modules.x' } })
    expect(w.find('h1').text()).toBe('modules.x')
    expect(w.find('p').text()).toBe('common.comingSoon')
  })
})

describe('UiZoomControls', () => {
  beforeEach(() => {
    zoomApi.zoomIn.mockClear()
    zoomApi.zoomOut.mockClear()
    zoomApi.canZoomIn = true
    zoomApi.canZoomOut = true
    zoomApi.zoomPercent = 100
  })

  it('mostra percentual e chama zoomIn/zoomOut', async () => {
    const w = mount(UiZoomControls)
    expect(w.find('.ui-zoom-controls__value').text()).toBe('100%')
    const btns = w.findAll('button')
    await btns[0]!.trigger('click')
    await btns[1]!.trigger('click')
    expect(zoomApi.zoomOut).toHaveBeenCalledOnce()
    expect(zoomApi.zoomIn).toHaveBeenCalledOnce()
  })

  it('desabilita nos limites', () => {
    zoomApi.canZoomIn = false
    zoomApi.canZoomOut = false
    const w = mount(UiZoomControls)
    const btns = w.findAll('button')
    expect(btns[0]!.attributes('disabled')).toBeDefined()
    expect(btns[1]!.attributes('disabled')).toBeDefined()
  })
})

describe('InAppProjectionOverlay', () => {
  function mountOverlay() {
    return mount(InAppProjectionOverlay, {
      props: {
        label: 'Preview',
        closeLabel: 'Fechar',
        hint: 'ESC fecha',
        scope: 'bible',
      },
    })
  }

  it('renderiza label, hint, close e stage palette', () => {
    const w = mountOverlay()
    expect(w.find('.inapp-projection').attributes('aria-label')).toBe('Preview')
    expect(w.find('.inapp-projection__hotkey-hint').text()).toBe('ESC fecha')
    expect(w.find('.stage-palette-stub').exists()).toBe(true)
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(true)
    w.unmount()
    expect(document.documentElement.classList.contains('inapp-projection-open')).toBe(false)
  })

  it('botão close emite close', async () => {
    const w = mountOverlay()
    await w.find('.inapp-projection__tool-btn').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('ESC em elemento neutro emite close; ESC em textarea/input de texto não emite', async () => {
    const w = mountOverlay()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(1)

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(1)

    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(1)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.appendChild(checkbox)
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(2)
    w.unmount()
  })

  it('tecla não-ESC ignorada; unmount remove listener', async () => {
    const w = mountOverlay()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(w.emitted('close')).toBeUndefined()
    w.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toBeUndefined()
  })
})

describe('ProjectionHost', () => {
  it.each([
    [{ module: 'clock' }, '.v-clock'],
    [{ module: 'timer' }, '.v-timer'],
    [{ module: 'countdown' }, '.v-countdown'],
    [{ module: 'random' }, '.v-random'],
    [{ module: 'bible' }, '.v-bible'],
    [{ module: 'media', layout: 'return' }, '.v-media-return'],
    [{ module: 'media' }, '.v-media'],
    [{ module: 'liturgy-web' }, '.v-liturgy-web'],
    [{}, '.projection-host-empty'],
    [{ module: 'desconhecido' }, '.projection-host-empty'],
  ])('rota %j → %s', (query, selector) => {
    for (const k of Object.keys(routeQuery)) delete routeQuery[k]
    Object.assign(routeQuery, query)
    const w = mount(ProjectionHost)
    expect(w.find(selector as string).exists()).toBe(true)
    w.unmount()
  })
})
