// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CAROUSEL_RUNTIME_STORAGE_KEY,
  DEFAULT_CAROUSEL_RUNTIME,
  buildCarouselSlides,
  carouselRuntimeFromSlide,
  normalizeCarouselRuntime,
  publishCarouselRuntime,
  readCarouselRuntime,
} from '../carousel-runtime'
import type { Announcement } from '../../types/announcements'

const items: Announcement[] = [
  { id: 't1', kind: 'text', title: 'Batismo', titleColor: '#fff', html: '<p>x</p>', plainText: 'x' },
  { id: 'vazio', kind: 'text', title: ' ', titleColor: '', html: '', plainText: '' },
  { id: 'a1', kind: 'images', title: 'Fotos', files: [
    { relativePath: 'modulos/avisos/a1/1.png', name: '1.png' },
    { relativePath: 'modulos/avisos/a1/2.png', name: '2.png' },
  ] },
  { id: 'v1', kind: 'video', title: 'V', file: { relativePath: 'modulos/avisos/v1/1.mp4', name: 'v' } },
  { id: 'p1', kind: 'presentation', title: 'P', file: null },
]

beforeEach(() => localStorage.clear())

describe('buildCarouselSlides', () => {
  it('texto vira um slide, cada imagem vira um slide; vídeo, apresentação e texto vazio ficam de fora', () => {
    expect(buildCarouselSlides(items)).toEqual([
      { key: 't1', kind: 'text', title: 'Batismo', html: '<p>x</p>', titleColor: '#fff' },
      { key: 'a1:0', kind: 'image', relativePath: 'modulos/avisos/a1/1.png', name: '1.png' },
      { key: 'a1:1', kind: 'image', relativePath: 'modulos/avisos/a1/2.png', name: '2.png' },
    ])
  })
})

describe('fora do carrossel', () => {
  it('avisos tirados do carrossel não viram slide', () => {
    const slides = buildCarouselSlides([
      { id: 't1', kind: 'text', title: 'Fora', titleColor: '', html: '<p>x</p>', plainText: 'x', inCarousel: false },
      { id: 't2', kind: 'text', title: 'Dentro', titleColor: '', html: '<p>y</p>', plainText: 'y' },
      { id: 'a1', kind: 'images', title: '', files: [{ relativePath: 'modulos/avisos/a1/1.png', name: '1' }], inCarousel: false },
    ])
    expect(slides.map((slide) => slide.key)).toEqual(['t2'])
  })
})

describe('runtime', () => {
  it('slide → runtime', () => {
    const [text, image] = buildCarouselSlides(items)
    expect(carouselRuntimeFromSlide(text!)).toEqual({ active: true, kind: 'text', relativePath: '', title: 'Batismo', text: 'x' })
    expect(carouselRuntimeFromSlide(image!)).toEqual({ active: true, kind: 'image', relativePath: 'modulos/avisos/a1/1.png', title: '', text: '' })
    expect(carouselRuntimeFromSlide(null)).toEqual(DEFAULT_CAROUSEL_RUNTIME)
  })

  it.each([
    [null, DEFAULT_CAROUSEL_RUNTIME],
    [{ active: true, kind: 'video' }, DEFAULT_CAROUSEL_RUNTIME],
    [{ active: true, kind: 'text', relativePath: 'x', title: 'T', text: 'a\nb' }, { active: true, kind: 'text', relativePath: '', title: 'T', text: 'a\nb' }],
    [{ active: 'sim', kind: 'image', relativePath: 7, title: 'x', text: 'y' }, { active: false, kind: 'image', relativePath: '', title: '', text: '' }],
    [{ active: true, kind: 'text', title: 3 }, { active: true, kind: 'text', relativePath: '', title: '', text: '' }],
  ])('normaliza %j', (raw, expected) => {
    expect(normalizeCarouselRuntime(raw)).toEqual(expected)
  })

  it('publica no localStorage e no BroadcastChannel; lê de volta', () => {
    const posted: unknown[] = []
    class FakeChannel {
      constructor(public name: string) {}
      postMessage(data: unknown) { posted.push(data) }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const state = { active: true, kind: 'image' as const, relativePath: 'modulos/avisos/a1/1.png', title: '', text: '' }
    publishCarouselRuntime(state)
    expect(JSON.parse(localStorage.getItem(CAROUSEL_RUNTIME_STORAGE_KEY)!)).toEqual(state)
    expect(posted).toEqual([state])
    expect(readCarouselRuntime()).toEqual(state)
    vi.unstubAllGlobals()
  })

  it('JSON quebrado lê como desligado; falhas de storage/canal não lançam', () => {
    localStorage.setItem(CAROUSEL_RUNTIME_STORAGE_KEY, '{quebrado')
    expect(readCarouselRuntime()).toEqual(DEFAULT_CAROUSEL_RUNTIME)
    vi.stubGlobal('BroadcastChannel', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio') })
    expect(() => publishCarouselRuntime(DEFAULT_CAROUSEL_RUNTIME)).not.toThrow()
    setItem.mockRestore()
    vi.unstubAllGlobals()
  })
})
