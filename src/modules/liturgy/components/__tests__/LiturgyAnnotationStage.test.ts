// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const base = {
  backgroundColor: null as string | null,
  backgroundImage: null as string | null,
  textColor: null as string | null,
  fontSize: 96,
  fontWeight: 600,
  textShadow: true,
  shadowBlur: 2.2,
  shadowIntensity: 0.8,
  textBox: true,
  boxOpacity: 0.45,
  boxBorder: true,
  textAlign: 'center',
  textVerticalAlign: 'middle',
  titleFontSize: null as number | null,
  titleFontWeight: null as number | null,
  titleTextColor: null as string | null,
  titleUpperCase: false,
  titleTextShadow: null as boolean | null,
}

const env = vi.hoisted(() => ({
  independent: false,
  stage: {} as Record<string, unknown>,
  bibleStage: {} as Record<string, unknown>,
  stageSubs: [] as Array<() => void>,
}))

vi.mock('@shared/services/projection-window-location', () => ({
  isIndependentProjectionLocation: () => env.independent,
}))

vi.mock('../../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: (scope: string) =>
    scope === 'bible' ? { ...env.bibleStage } : { ...env.stage, scope },
  subscribeStageSettings: (cb: () => void) => {
    env.stageSubs.push(cb)
    return () => {
      env.stageSubs = env.stageSubs.filter((item) => item !== cb)
    }
  },
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { name: 'ProjectionBackground', template: '<div class="pb-stub"><slot /></div>' },
}))

import {
  ANNOTATION_INDEPENDENT_STORAGE_KEY,
  ANNOTATION_RUNTIME_STORAGE_KEY,
} from '../../services/annotation-projection-runtime'
import LiturgyAnnotationStage from '../LiturgyAnnotationStage.vue'

class FakeChannel {
  static instances: FakeChannel[] = []
  listeners: Array<(event: MessageEvent<unknown>) => void> = []
  closed = false
  constructor(readonly name: string) {
    FakeChannel.instances.push(this)
  }
  addEventListener(_type: string, cb: (event: MessageEvent<unknown>) => void) {
    this.listeners.push(cb)
  }
  removeEventListener(_type: string, cb: (event: MessageEvent<unknown>) => void) {
    this.listeners = this.listeners.filter((item) => item !== cb)
  }
  close() {
    this.closed = true
  }
  emit(data: unknown) {
    this.listeners.forEach((cb) => cb({ data } as MessageEvent<unknown>))
  }
}

function setRuntime(key: string, value: Record<string, unknown>) {
  localStorage.setItem(key, JSON.stringify(value))
}

describe('LiturgyAnnotationStage', () => {
  beforeEach(() => {
    localStorage.clear()
    env.independent = false
    env.stage = { ...base }
    env.bibleStage = { footerRefColor: null }
    env.stageSubs = []
    FakeChannel.instances = []
    vi.stubGlobal('BroadcastChannel', FakeChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra título e texto formatado com o estilo do Palco da Liturgia', async () => {
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, {
      active: true,
      title: 'Almoço',
      html: '<b>Sábado</b><script>alert(1)</script>',
    })
    const wrapper = mount(LiturgyAnnotationStage, { props: { embedded: true } })
    await flushPromises()
    expect(wrapper.classes()).toContain('annotation-projection--embedded')
    expect(wrapper.find('.annotation-projection__title').text()).toBe('Almoço')
    const text = wrapper.get('[data-testid="annotation-projection-text"]')
    expect(text.html()).toContain('<b>Sábado</b>')
    expect(text.html()).not.toContain('script')
    const style = text.attributes('style')!
    expect(style).toContain('font-size: 4cqw')
    expect(style).toContain('background-color: rgba(24, 24, 24, 0.45)')
    expect(wrapper.attributes('style')).toContain('background-color: rgb(0, 0, 0)')
    expect(FakeChannel.instances[0].name).toBe('louvorja-liturgy-annotation')
    wrapper.unmount()
    expect(FakeChannel.instances[0].closed).toBe(true)
    expect(env.stageSubs).toHaveLength(0)
  })

  it('projeção independente lê o canal próprio e acompanha mensagens', async () => {
    env.independent = true
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Principal', html: '' })
    setRuntime(ANNOTATION_INDEPENDENT_STORAGE_KEY, { active: true, title: 'Independente', html: '' })
    const wrapper = mount(LiturgyAnnotationStage)
    expect(wrapper.text()).toContain('Independente')
    expect(FakeChannel.instances[0].name).toBe('louvorja-liturgy-annotation-independent')
    FakeChannel.instances[0].emit({ active: true, title: 'Novo aviso', html: '<i>texto</i>' })
    await flushPromises()
    expect(wrapper.find('.annotation-projection__title').text()).toBe('Novo aviso')
    expect(wrapper.find('[data-testid="annotation-projection-text"]').html()).toContain('<i>texto</i>')
    wrapper.unmount()
  })

  it('evento de storage do canal certo atualiza; de outra chave é ignorado', async () => {
    const wrapper = mount(LiturgyAnnotationStage)
    expect(wrapper.find('[data-testid="annotation-projection-content"]').exists()).toBe(false)
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Avisos', html: '' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="annotation-projection-content"]').exists()).toBe(false)
    window.dispatchEvent(new StorageEvent('storage', { key: ANNOTATION_RUNTIME_STORAGE_KEY }))
    await flushPromises()
    expect(wrapper.find('.annotation-projection__title').text()).toBe('Avisos')
    expect(wrapper.find('[data-testid="annotation-projection-text"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('desligada ou sem conteúdo: palco vazio', () => {
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: false, title: 'Almoço', html: '<b>x</b>' })
    const off = mount(LiturgyAnnotationStage)
    expect(off.find('.annotation-projection__empty').exists()).toBe(true)
    off.unmount()
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: '  ', html: '' })
    const empty = mount(LiturgyAnnotationStage)
    expect(empty.find('.annotation-projection__empty').exists()).toBe(true)
    empty.unmount()
  })

  it('estilo do título próprio, sem caixa, sem sombra e fundo personalizado', async () => {
    env.stage = {
      ...base,
      backgroundColor: '#112233',
      backgroundImage: 'official:bg-01',
      textColor: '#eeeeee',
      textShadow: false,
      textBox: false,
      titleFontSize: 192,
      titleFontWeight: 800,
      titleTextColor: '#ff0000',
      titleUpperCase: true,
      titleTextShadow: true,
    }
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Avisos', html: 'curto' })
    const wrapper = mount(LiturgyAnnotationStage)
    const title = wrapper.get('.annotation-projection__title').attributes('style')!
    expect(title).toContain('color: rgb(255, 0, 0)')
    expect(title).toContain('font-size: 10cqw')
    expect(title).toContain('font-weight: 800')
    expect(title).toContain('text-transform: uppercase')
    expect(title).toContain('text-shadow: 0 0')
    const text = wrapper.get('[data-testid="annotation-projection-text"]').attributes('style')!
    expect(text).toContain('color: rgb(238, 238, 238)')
    expect(text).toContain('text-shadow: none')
    expect(text).not.toContain('background-color')
    expect(wrapper.attributes('style')).toContain('background-image: url(')
    env.stage = { ...env.stage, boxBorder: false, textBox: true }
    env.stageSubs.forEach((cb) => cb())
    await flushPromises()
    const boxed = wrapper.get('[data-testid="annotation-projection-text"]').attributes('style')!
    expect(boxed).toContain('background-color: rgba(24, 24, 24, 0.45)')
    expect(boxed).not.toContain('solid')
    wrapper.unmount()
  })

  it('título sem cor própria usa a cor da referência da Bíblia', async () => {
    env.stage = { ...base, textColor: '#eeeeee' }
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Avisos', html: 'texto' })
    const wrapper = mount(LiturgyAnnotationStage)
    const titleStyle = () => wrapper.get('.annotation-projection__title').attributes('style')!
    expect(titleStyle()).toContain('color: rgb(251, 140, 0)')

    env.bibleStage = { footerRefColor: '#FCCE02' }
    env.stageSubs.forEach((cb) => cb())
    await flushPromises()
    expect(titleStyle()).toContain('color: rgb(252, 206, 2)')
    wrapper.unmount()
  })

  it('cor escolhida na anotação vence a do Palco e a da Bíblia', () => {
    env.stage = { ...base, titleTextColor: '#ff0000' }
    env.bibleStage = { footerRefColor: '#FCCE02' }
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Avisos', html: '', titleColor: '#42a5f5' })
    const wrapper = mount(LiturgyAnnotationStage)
    expect(wrapper.get('.annotation-projection__title').attributes('style')).toContain('color: rgb(66, 165, 245)')
    wrapper.unmount()
  })

  it('texto longo diminui de tamanho para caber', () => {
    const sizes = [250, 400, 700].map((length) => {
      localStorage.setItem(
        ANNOTATION_RUNTIME_STORAGE_KEY,
        JSON.stringify({ active: true, title: '', html: `<div>${'a'.repeat(length)}</div>` }),
      )
      const wrapper = mount(LiturgyAnnotationStage)
      const style = wrapper.get('[data-testid="annotation-projection-text"]').attributes('style')!
      wrapper.unmount()
      return style.match(/font-size: ([\d.]+)cqw/)![1]
    })
    expect(sizes).toEqual(['3.5', '3', '2.5'])
  })

  it('sem BroadcastChannel ainda funciona pelo storage', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    setRuntime(ANNOTATION_RUNTIME_STORAGE_KEY, { active: true, title: 'Avisos', html: '' })
    const wrapper = mount(LiturgyAnnotationStage)
    expect(wrapper.text()).toContain('Avisos')
    wrapper.unmount()
  })
})
