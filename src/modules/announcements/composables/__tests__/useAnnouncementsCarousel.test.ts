// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  publishAnnotation: vi.fn(),
  publishCarousel: vi.fn(),
  hasTargets: vi.fn(),
  open: vi.fn(),
  isOpen: vi.fn(),
  close: vi.fn(),
  independentActive: vi.fn(),
  closeIndependent: vi.fn(),
  projectRouted: vi.fn(),
  obsInput: vi.fn(),
}))
vi.mock('@modules/settings/services/palco-session', () => ({ palcoSession: { projectRouted: mocks.projectRouted } }))
vi.mock('../../services/carousel-obs', () => ({ carouselObsInput: mocks.obsInput }))
vi.mock('@shared/composables/useIndependentProjection', () => ({
  isIndependentProjectionActive: mocks.independentActive,
  closeIndependentProjection: mocks.closeIndependent,
}))
vi.mock('@modules/liturgy/services/annotation-projection-runtime', () => ({
  DEFAULT_ANNOTATION_RUNTIME: { active: false, title: '', html: '', titleColor: '' },
  publishAnnotationRuntime: mocks.publishAnnotation,
}))
vi.mock('@shared/composables/useProjectionWindow', () => ({
  hasSelectedExtendedProjectionTargets: mocks.hasTargets,
  openProjectionModule: mocks.open,
  isProjectionModuleOpen: mocks.isOpen,
  closeProjectionModule: mocks.close,
}))
vi.mock('../../services/carousel-runtime', async (original) => ({
  ...await original<typeof import('../../services/carousel-runtime')>(),
  publishCarouselRuntime: mocks.publishCarousel,
}))

import type { Announcement } from '../../types/announcements'
import { useAnnouncementsCarousel } from '../useAnnouncementsCarousel'

const T0 = new Date('2026-11-07T09:00:00Z').getTime()

function texts(n: number): Announcement[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, kind: 'text' as const, title: `Aviso ${i}`, titleColor: '', html: `<p>${i}</p>`, plainText: String(i),
  }))
}

const carousel = useAnnouncementsCarousel()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.hasTargets.mockResolvedValue(false)
  mocks.isOpen.mockReturnValue(false)
  mocks.open.mockResolvedValue(true)
  mocks.independentActive.mockReturnValue(false)
  mocks.projectRouted.mockResolvedValue(undefined)
  mocks.obsInput.mockImplementation(async () => ({ text: `slide-${carousel.index.value}` }))
})

afterEach(() => {
  carousel.stop()
  vi.useRealTimers()
})

describe('useAnnouncementsCarousel', () => {
  it('lista só com vídeo/apresentação não inicia', async () => {
    await expect(carousel.start([{ id: 'v', kind: 'video', title: '', file: null }], { slideMs: 5000, loop: true })).resolves.toBe(false)
    expect(carousel.isActive.value).toBe(false)
  })

  it('3 textos, 5 s, repetindo: troca a cada 5 s e volta ao primeiro', async () => {
    await carousel.start(texts(3), { slideMs: 5000, loop: true })
    expect(carousel.status.value).toBe('playing')
    expect(carousel.total.value).toBe(3)
    expect(mocks.publishAnnotation).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Aviso 0', active: true }), false)

    vi.advanceTimersByTime(4900)
    expect(carousel.index.value).toBe(0)
    vi.advanceTimersByTime(200)
    expect(carousel.index.value).toBe(1)
    vi.advanceTimersByTime(5000)
    expect(carousel.index.value).toBe(2)
    vi.advanceTimersByTime(5000)
    expect(carousel.index.value).toBe(0)
    expect(mocks.publishCarousel).toHaveBeenLastCalledWith({ active: true, kind: 'text', relativePath: '', title: 'Aviso 0', text: '0' })
  })

  it('janela em segundo plano: acorda 12 s depois e pula para o slide certo', async () => {
    await carousel.start(texts(5), { slideMs: 5000, loop: true })
    vi.setSystemTime(T0 + 12_000)
    carousel.tick()
    expect(carousel.index.value).toBe(2)
    // o próximo vence aos 15 s, não 5 s depois de acordar
    carousel.tick(T0 + 14_999)
    expect(carousel.index.value).toBe(2)
    carousel.tick(T0 + 15_000)
    expect(carousel.index.value).toBe(3)
  })

  it('sem repetir: para no último slide como "terminado"; continuar recomeça', async () => {
    await carousel.start(texts(2), { slideMs: 5000, loop: false })
    vi.advanceTimersByTime(5000)
    expect(carousel.index.value).toBe(1)
    vi.advanceTimersByTime(20_000)
    expect(carousel.index.value).toBe(1)
    expect(carousel.status.value).toBe('ended')
    carousel.resume()
    expect(carousel.status.value).toBe('playing')
    expect(carousel.index.value).toBe(0)
  })

  it('pausar congela o tempo restante e continuar respeita o que faltava', async () => {
    await carousel.start(texts(3), { slideMs: 5000, loop: true })
    vi.advanceTimersByTime(3000)
    carousel.pause()
    vi.advanceTimersByTime(60_000)
    expect(carousel.index.value).toBe(0)
    expect(carousel.status.value).toBe('paused')
    carousel.resume()
    vi.advanceTimersByTime(1900)
    expect(carousel.index.value).toBe(0)
    vi.advanceTimersByTime(200)
    expect(carousel.index.value).toBe(1)
    carousel.resume() // já tocando: nada muda
    carousel.pause()
    carousel.pause()
    expect(carousel.status.value).toBe('paused')
  })

  it('próximo/anterior manuais dão o tempo inteiro ao slide novo', async () => {
    await carousel.start(texts(3), { slideMs: 5000, loop: true })
    vi.advanceTimersByTime(4000)
    carousel.next()
    expect(carousel.index.value).toBe(1)
    vi.advanceTimersByTime(4900)
    expect(carousel.index.value).toBe(1)
    carousel.prev()
    carousel.prev()
    expect(carousel.index.value).toBe(2)
  })

  it('manual sem repetir: anterior no primeiro não volta; próximo no último termina', async () => {
    await carousel.start(texts(2), { slideMs: 5000, loop: false })
    carousel.prev()
    expect(carousel.index.value).toBe(0)
    carousel.next()
    carousel.next()
    expect(carousel.status.value).toBe('ended')
    carousel.prev()
    expect(carousel.status.value).toBe('paused')
    expect(carousel.index.value).toBe(0)
    carousel.pause()
    carousel.next()
    expect(carousel.index.value).toBe(1)
  })

  it('imagens publicam o caminho da imagem', async () => {
    await carousel.start([{ id: 'a', kind: 'images', title: '', files: [{ relativePath: 'modulos/avisos/a/1.png', name: '1' }] }], { slideMs: 5000, loop: true })
    expect(carousel.currentSlide.value).toMatchObject({ kind: 'image' })
    expect(mocks.publishCarousel).toHaveBeenLastCalledWith({ active: true, kind: 'image', relativePath: 'modulos/avisos/a/1.png', title: '', text: '' })
    expect(mocks.publishAnnotation).not.toHaveBeenCalled()
  })

  it('com telas estendidas abre a janela; parar fecha e limpa a projeção', async () => {
    mocks.hasTargets.mockResolvedValue(true)
    await carousel.start(texts(2), { slideMs: 5000, loop: true })
    expect(mocks.open).toHaveBeenCalledWith('announcements-carousel')
    expect(carousel.projecting.value).toBe(true)
    mocks.isOpen.mockReturnValue(true)
    carousel.stop()
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.publishCarousel).toHaveBeenLastCalledWith({ active: false, kind: null, relativePath: '', title: '', text: '' })
    expect(mocks.publishAnnotation).toHaveBeenLastCalledWith(expect.objectContaining({ active: false }), false)
    expect(carousel.isActive.value).toBe(false)
  })

  it('outro módulo tomou a tela: o carrossel para sozinho', async () => {
    mocks.hasTargets.mockResolvedValue(true)
    await carousel.start(texts(2), { slideMs: 5000, loop: true })
    mocks.isOpen.mockReturnValue(false)
    vi.advanceTimersByTime(300)
    expect(carousel.isActive.value).toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('independente com carrossel parado: começa só nela, sem abrir a janela principal', async () => {
    mocks.hasTargets.mockResolvedValue(true)
    await expect(carousel.prepareIndependent(texts(2), { slideMs: 5000, loop: true })).resolves.toBe(true)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(carousel.independent.value).toBe(true)
    expect(carousel.status.value).toBe('playing')
    expect(mocks.publishAnnotation).toHaveBeenCalledWith(expect.objectContaining({ title: 'Aviso 0' }), true)
    mocks.independentActive.mockReturnValue(true)
    vi.advanceTimersByTime(5000)
    expect(mocks.publishAnnotation).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Aviso 1' }), true)
    carousel.stop()
    expect(mocks.closeIndependent).toHaveBeenCalledWith('announcements-carousel')
    expect(mocks.publishAnnotation).toHaveBeenCalledWith(expect.objectContaining({ active: false }), true)
    expect(carousel.independent.value).toBe(false)
  })

  it('independente com lista sem slides não começa', async () => {
    await expect(carousel.prepareIndependent([], { slideMs: 5000, loop: true })).resolves.toBe(false)
    expect(carousel.independent.value).toBe(false)
  })

  it('independente com carrossel rodando passa a publicar nela também; fechar a janela solta o canal', async () => {
    await carousel.start(texts(3), { slideMs: 5000, loop: true })
    await carousel.prepareIndependent(texts(1), { slideMs: 1000, loop: false })
    expect(carousel.total.value).toBe(3)
    vi.advanceTimersByTime(300) // ainda abrindo: não solta
    expect(carousel.independent.value).toBe(true)
    mocks.independentActive.mockReturnValue(true)
    vi.advanceTimersByTime(300)
    mocks.independentActive.mockReturnValue(false)
    vi.advanceTimersByTime(300)
    expect(carousel.independent.value).toBe(false)
    expect(carousel.isActive.value).toBe(true)
    carousel.stop()
    expect(mocks.closeIndependent).not.toHaveBeenCalled()
  })

  it('outro módulo toma as telas mas a independente segue: o carrossel continua', async () => {
    mocks.hasTargets.mockResolvedValue(true)
    await carousel.start(texts(2), { slideMs: 5000, loop: true })
    await carousel.prepareIndependent(texts(2), { slideMs: 5000, loop: true })
    mocks.independentActive.mockReturnValue(true)
    mocks.isOpen.mockReturnValue(false)
    vi.advanceTimersByTime(300)
    expect(carousel.isActive.value).toBe(true)
    expect(carousel.projecting.value).toBe(false)
  })

  it('"Projetar em carrossel" manda cada slide às conexões remotas, em ordem, e limpa ao parar', async () => {
    await carousel.start(texts(2), { slideMs: 5000, loop: true })
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.projectRouted.mock.calls).toEqual([
      ['liturgy', 'liturgy', { text: 'slide-0' }],
      ['liturgy', 'liturgy', { text: 'slide-1' }],
    ])
    mocks.obsInput.mockResolvedValueOnce({ text: '' })
    carousel.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.projectRouted).toHaveBeenLastCalledWith('liturgy', 'liturgy', { text: '' })
  })

  it('conexão remota com erro não trava o carrossel', async () => {
    mocks.projectRouted.mockRejectedValueOnce(new Error('offline'))
    await carousel.start(texts(2), { slideMs: 5000, loop: true })
    await vi.advanceTimersByTimeAsync(5000)
    expect(carousel.index.value).toBe(1)
    expect(mocks.projectRouted).toHaveBeenCalledTimes(2)
  })

  it('só na projeção independente não usa a rota remota principal', async () => {
    await carousel.prepareIndependent(texts(2), { slideMs: 5000, loop: true })
    await vi.advanceTimersByTimeAsync(5000)
    carousel.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.projectRouted).not.toHaveBeenCalled()
  })

  it('mudar tempo e repetição no meio vale a partir do próximo slide; sem carrossel, próximo não faz nada', async () => {
    carousel.next()
    expect(carousel.isActive.value).toBe(false)
    await carousel.start(texts(3), { slideMs: 5000, loop: false })
    carousel.setSlideMs(2000)
    carousel.setLoop(true)
    vi.advanceTimersByTime(5000)
    expect(carousel.index.value).toBe(1)
    vi.advanceTimersByTime(2000)
    expect(carousel.index.value).toBe(2)
    vi.advanceTimersByTime(2000)
    expect(carousel.index.value).toBe(0)
  })
})
