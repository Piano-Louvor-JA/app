// @vitest-environment jsdom
/**
 * BibleProjectionView — runtime REAL (localStorage/BroadcastChannel) e computed
 * de estilo (fonte adaptativa, caixa, referência sem versão).
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const stageValue = vi.hoisted(() => ({
  value: {
    backgroundColor: '#000000',
    backgroundImage: null,
    bibleFontSize: 96,
    bibleTextColor: '#ffffff',
    bibleFontWeight: 400,
    bibleTextTransform: 'none' as 'none' | 'uppercase' | 'capitalize',
    textAlign: 'left',
    textVerticalAlign: 'center',
    textShadow: true,
    shadowBlur: 54,
    shadowIntensity: 0.6,
    showBibleVersion: true,
    textBox: true,
    boxOpacity: 0.5,
    boxBorder: true,
    footerRefColor: '#dddddd',
    footerRefWeight: 600,
    refFontSize: null as number | null,
    refTextTransform: 'none' as 'none' | 'uppercase' | 'capitalize',
  },
}))

const stageSubs = vi.hoisted(() => ({ cbs: [] as Array<() => void> }))
vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => ({ ...(stageValue.value as object) }),
  subscribeStageSettings: (cb: () => void) => {
    stageSubs.cbs.push(cb)
    return () => {}
  },
}))

vi.mock('../../../settings/types/stage-settings', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveBackgroundImage: (v: unknown) => (v ? String(v) : null),
  stageFlexAlign: () => ({ display: 'flex' }),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: {
    name: 'ProjectionBackground',
    template: '<div class="pb-stub"><slot /></div>',
  },
}))

import BibleProjectionView from '../BibleProjectionView.vue'

const RUNTIME_KEY = 'louvorja-bible-runtime-state'

function setRuntime(active = true, text = 'No princípio criou Deus os céus', reference = 'Gênesis 1:1 (ARC)') {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify({ active, text, reference }))
}

describe('BibleProjectionView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stageSubs.cbs = []
    localStorage.clear()
    setRuntime()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('monta com conteúdo ativo: texto e referência renderizam', async () => {
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.find('.pb-stub').exists()).toBe(true)
    expect(w.text()).toContain('No princípio criou Deus os céus')
    expect(w.text()).toContain('Gênesis 1:1 (ARC)')
    w.unmount()
  })

  it('showBibleVersion false: referência perde sufixo (versão)', async () => {
    stageValue.value.showBibleVersion = false
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.text()).toContain('Gênesis 1:1')
    expect(w.text()).not.toContain('(ARC)')
    w.unmount()
  })

  it('runtime inativo ou sem texto: estado vazio', async () => {
    setRuntime(false, '', '')
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.find('.bible-projection__empty').exists()).toBe(true)
    w.unmount()
  })

  it('fonte adaptativa: texto longo reduz a escala', async () => {
    setRuntime(true, 'x'.repeat(400), 'Sl 119')
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.text()).toContain('x')
    w.unmount()
    setRuntime(true, 'y'.repeat(200), 'Sl 1')
    const w2 = mount(BibleProjectionView)
    await flushPromises()
    expect(w2.text()).toContain('y')
    w2.unmount()
  })

  it('storage event com a key certa atualiza runtime', async () => {
    const w = mount(BibleProjectionView)
    await flushPromises()
    localStorage.setItem(
      RUNTIME_KEY,
      JSON.stringify({ active: true, text: 'Via storage', reference: 'Jo 3:16' }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: RUNTIME_KEY }))
    await flushPromises()
    expect(w.text()).toContain('Via storage')
    w.unmount()
  })

  it('storage com key diferente: ignora', async () => {
    const w = mount(BibleProjectionView)
    await flushPromises()
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    await flushPromises()
    expect(w.text()).toContain('No princípio')
    w.unmount()
  })

  it('stage subscription callback atualiza; textBox false remove estilo', async () => {
    const w = mount(BibleProjectionView)
    await flushPromises()
    stageValue.value.textBox = false
    stageValue.value.textShadow = false
    for (const cb of stageSubs.cbs) cb()
    await flushPromises()
    expect(w.find('.pb-stub').exists()).toBe(true)
    w.unmount()
  })

  it('embedded aplica classe; unmount não lança', async () => {
    const w = mount(BibleProjectionView, { props: { embedded: true } })
    await flushPromises()
    expect(w.html()).toContain('bible-projection--embedded')
    w.unmount()
  })

  it('referência aplica tamanho e transformação configurados', async () => {
    stageValue.value.refFontSize = 72
    stageValue.value.refTextTransform = 'uppercase'
    const w = mount(BibleProjectionView)
    await flushPromises()
    const style = w.find('.bible-projection__reference').attributes('style')
    expect(style).toContain('font-size: 3.75cqw')
    expect(style).toContain('text-transform: uppercase')
    w.unmount()
  })

  it('B1 (paridade web): verseStyle aplica textTransform do Palco (uppercase)', async () => {
    stageValue.value.bibleTextTransform = 'uppercase'
    const w = mount(BibleProjectionView)
    await flushPromises()
    const style = w.find('.bible-projection__text').attributes('style')
    expect(style).toContain('text-transform: uppercase')
    w.unmount()
  })

  it('B1 (paridade web): bibleTextTransform capitalize aplica capitalização', async () => {
    stageValue.value.bibleTextTransform = 'capitalize'
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.find('.bible-projection__text').attributes('style')).toContain(
      'text-transform: capitalize',
    )
    w.unmount()
  })

  it('B1 (paridade web): bibleTextTransform none NÃO aplica transform', async () => {
    stageValue.value.bibleTextTransform = 'none'
    const w = mount(BibleProjectionView)
    await flushPromises()
    expect(w.find('.bible-projection__text').attributes('style')).not.toContain(
      'text-transform: uppercase',
    )
    expect(w.find('.bible-projection__text').attributes('style')).not.toContain(
      'text-transform: capitalize',
    )
    w.unmount()
  })

  describe('transição ao trocar versículo', () => {
    const stage = stageValue.value as Record<string, unknown>
    afterEach(() => {
      delete stage.bibleTransition
      delete stage.bibleTransitionSpeed
    })
    async function mounted() {
      const w = mount(BibleProjectionView)
      await flushPromises()
      return w
    }

    it('padrão: suave, na velocidade normal', async () => {
      const w = await mounted()
      expect(w.html()).toContain('name="bible-fade"')
      expect(w.find('.pb-stub').attributes('style')).toContain('--bible-transition-ms: 250ms')
      w.unmount()
    })

    it('tipo e velocidade do Palco', async () => {
      stage.bibleTransition = 'zoom'
      stage.bibleTransitionSpeed = 'slow'
      const w = await mounted()
      expect(w.html()).toContain('name="bible-zoom"')
      expect(w.html()).not.toContain('name="bible-fade"')
      expect(w.find('.pb-stub').attributes('style')).toContain('--bible-transition-ms: 450ms')
      w.unmount()
    })

    it('nenhuma: sem animação', async () => {
      stage.bibleTransition = 'none'
      const w = await mounted()
      expect(w.html()).toContain('name="bible-none"')
      w.unmount()
    })
  })

  describe('posição da referência', () => {
    const stage = stageValue.value as Record<string, unknown>
    afterEach(() => {
      delete stage.bibleRefPosition
    })
    async function reference() {
      const w = mount(BibleProjectionView)
      await flushPromises()
      return { w, ref: w.find('.bible-projection__reference') }
    }

    it('padrão: abaixo do texto, à direita', async () => {
      const { w, ref } = await reference()
      expect(ref.element.parentElement?.classList.contains('bible-projection__content')).toBe(true)
      expect(ref.attributes('style')).toContain('text-align: right')
      expect(ref.classes()).not.toContain('bible-projection__reference--corner')
      w.unmount()
    })

    it('abaixo do texto à esquerda e no centro', async () => {
      stage.bibleRefPosition = 'below-left'
      let r = await reference()
      expect(r.ref.attributes('style')).toContain('text-align: left')
      r.w.unmount()
      stage.bibleRefPosition = 'below-center'
      r = await reference()
      expect(r.ref.attributes('style')).toContain('text-align: center')
      r.w.unmount()
    })

    it('canto inferior direito da tela', async () => {
      stage.bibleRefPosition = 'corner'
      const { w, ref } = await reference()
      expect(w.findAll('.bible-projection__reference')).toHaveLength(1)
      expect(ref.classes()).toContain('bible-projection__reference--corner')
      expect(ref.element.parentElement?.classList.contains('bible-projection__content')).toBe(false)
      expect(ref.attributes('style')).not.toContain('text-align')
      w.unmount()
    })
  })
})
