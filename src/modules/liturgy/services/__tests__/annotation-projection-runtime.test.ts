// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ANNOTATION_INDEPENDENT_CHANNEL,
  ANNOTATION_INDEPENDENT_STORAGE_KEY,
  ANNOTATION_RUNTIME_CHANNEL,
  ANNOTATION_RUNTIME_STORAGE_KEY,
  annotationChannelName,
  annotationRuntimeFromItem,
  annotationStorageKey,
  normalizeAnnotationRuntime,
  publishAnnotationRuntime,
  readAnnotationRuntime,
} from '../annotation-projection-runtime'

const OFF = { active: false, title: '', html: '', titleColor: '' }
const posted: Array<{ name: string; data: unknown }> = []

class FakeChannel {
  constructor(readonly name: string) {}
  postMessage(data: unknown) {
    posted.push({ name: this.name, data })
  }
  close() {}
}

describe('annotation-projection-runtime', () => {
  beforeEach(() => {
    localStorage.clear()
    posted.length = 0
    vi.stubGlobal('BroadcastChannel', FakeChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('principal e independente usam canais separados', () => {
    expect(annotationStorageKey(false)).toBe(ANNOTATION_RUNTIME_STORAGE_KEY)
    expect(annotationStorageKey(true)).toBe(ANNOTATION_INDEPENDENT_STORAGE_KEY)
    expect(annotationChannelName(false)).toBe(ANNOTATION_RUNTIME_CHANNEL)
    expect(annotationChannelName(true)).toBe(ANNOTATION_INDEPENDENT_CHANNEL)
  })

  it('normaliza dados inválidos para o estado desligado', () => {
    expect(normalizeAnnotationRuntime(null)).toEqual(OFF)
    expect(normalizeAnnotationRuntime('x')).toEqual(OFF)
    expect(normalizeAnnotationRuntime({ active: 'sim', title: 3, html: {}, titleColor: 'red' })).toEqual(OFF)
    expect(
      normalizeAnnotationRuntime({ active: true, title: 'Avisos', html: '<b>x</b>', titleColor: '#FFEE58' }),
    ).toEqual({ active: true, title: 'Avisos', html: '<b>x</b>', titleColor: '#ffee58' })
  })

  it('monta o conteúdo do item: HTML limpo, ou o texto puro de anotações antigas', () => {
    expect(
      annotationRuntimeFromItem({
        name: '  Almoço  ',
        subtitle: 'ignorado',
        notesHtml: '<b>Sábado</b><script>alert(1)</script>',
        titleColor: '#42a5f5',
      }),
    ).toEqual({ active: true, title: 'Almoço', html: '<b>Sábado</b>', titleColor: '#42a5f5' })
    expect(annotationRuntimeFromItem({ name: 'Aviso', subtitle: 'Linha 1\nLinha <2>' })).toEqual({
      active: true,
      title: 'Aviso',
      html: '<div>Linha 1</div><div>Linha &lt;2&gt;</div>',
      titleColor: '',
    })
    expect(annotationRuntimeFromItem({ name: undefined as unknown as string })).toEqual({
      ...OFF,
      active: true,
    })
  })

  it('publica no storage e no canal de cada projeção', () => {
    const state = { active: true, title: 'A', html: '<b>B</b>', titleColor: '#ffffff' }
    publishAnnotationRuntime(state, false)
    publishAnnotationRuntime({ ...state, title: 'C' }, true)
    expect(readAnnotationRuntime(false)).toEqual(state)
    expect(readAnnotationRuntime(true)).toEqual({ ...state, title: 'C' })
    expect(posted).toEqual([
      { name: ANNOTATION_RUNTIME_CHANNEL, data: state },
      { name: ANNOTATION_INDEPENDENT_CHANNEL, data: { ...state, title: 'C' } },
    ])
  })

  it('leitura sem dado ou com JSON quebrado volta desligada', () => {
    expect(readAnnotationRuntime(false)).toEqual(OFF)
    localStorage.setItem(ANNOTATION_RUNTIME_STORAGE_KEY, '{quebrado')
    expect(readAnnotationRuntime(false)).toEqual(OFF)
  })

  it('publicar não quebra sem storage nem BroadcastChannel', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => publishAnnotationRuntime({ ...OFF, active: true, title: 'A' }, false)).not.toThrow()
  })
})
