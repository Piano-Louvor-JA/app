import { computed, readonly, ref } from 'vue'

import {
  DEFAULT_ANNOTATION_RUNTIME,
  publishAnnotationRuntime,
} from '@modules/liturgy/services/annotation-projection-runtime'
import { palcoSession } from '@modules/settings/services/palco-session'
import {
  closeIndependentProjection,
  isIndependentProjectionActive,
} from '@shared/composables/useIndependentProjection'
import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'

import {
  CAROUSEL_PROJECTION_MODULE,
  DEFAULT_CAROUSEL_RUNTIME,
  buildCarouselSlides,
  carouselRuntimeFromSlide,
  publishCarouselRuntime,
  type CarouselSlide,
} from '../services/carousel-runtime'
import { carouselObsInput } from '../services/carousel-obs'
import { CAROUSEL_SLIDE_MS_DEFAULT, type Announcement, type CarouselConfig } from '../types/announcements'

export type CarouselStatus = 'idle' | 'playing' | 'paused' | 'ended'

const TICK_MS = 250

// Estado de módulo: um carrossel por janela principal, sobrevive a sair da tela.
const slides = ref<CarouselSlide[]>([])
const index = ref(0)
const status = ref<CarouselStatus>('idle')
const config = ref<CarouselConfig>({ slideMs: CAROUSEL_SLIDE_MS_DEFAULT, loop: true })
/** Janela de projeção aberta por este carrossel (sem telas estendidas, só a prévia). */
const projecting = ref(false)
/** Iniciado por "Projetar em carrossel": também vai às conexões remotas (TVs/OBS) pela rota da Liturgia. */
let remote = false
/** Envios ao palco em ordem: um slide lento não chega depois do seguinte. */
let remoteQueue: Promise<void> = Promise.resolve()
/** Carrossel dono da projeção independente (Sobrepor/Compartilhar num monitor). */
const independent = ref(false)
/** A janela independente já abriu; se fechar depois, o carrossel larga o canal. */
let independentSeen = false
let deadlineMs = 0
let remainingMs = 0
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

function show() {
  const slide = slides.value[index.value] ?? null
  if (slide?.kind === 'text') {
    const runtime = { active: true, title: slide.title.trim(), html: slide.html, titleColor: slide.titleColor }
    publishAnnotationRuntime(runtime, false)
    // Texto na janela independente lê o canal independente da anotação.
    if (independent.value) publishAnnotationRuntime(runtime, true)
  }
  publishCarouselRuntime(carouselRuntimeFromSlide(slide))
  if (remote) sendRemote()
}

/** Slide atual (já publicado) para as conexões remotas; parado = tela vazia. */
function sendRemote() {
  remoteQueue = remoteQueue
    .then(async () => palcoSession.projectRouted('liturgy', 'liturgy', await carouselObsInput()))
    .catch(() => { /* conexão remota fora do ar não trava o carrossel */ })
}

function goTo(target: number) {
  const total = slides.value.length
  if (total === 0) return
  if (config.value.loop) {
    index.value = ((target % total) + total) % total
  } else if (target >= total) {
    index.value = total - 1
    status.value = 'ended'
  } else {
    index.value = Math.max(0, target)
  }
  show()
}

/** Avança pelo relógio do sistema: janela em segundo plano que acorda atrasada pula os slides vencidos. */
function tick(now = Date.now()) {
  const independentOpen = isIndependentProjectionActive(CAROUSEL_PROJECTION_MODULE)
  if (independent.value) {
    if (independentOpen) independentSeen = true
    else if (independentSeen) releaseIndependent()
  }
  if (projecting.value && !isProjectionModuleOpen(CAROUSEL_PROJECTION_MODULE)) {
    // Outro módulo tomou as telas: segue só se ainda está numa projeção independente.
    if (!independent.value) {
      stop()
      return
    }
    projecting.value = false
  }
  if (status.value !== 'playing' || now < deadlineMs) return
  const steps = 1 + Math.floor((now - deadlineMs) / config.value.slideMs)
  deadlineMs += steps * config.value.slideMs
  goTo(index.value + steps)
}

function startTimer() {
  clearTimer()
  timer = setInterval(() => tick(), TICK_MS)
}

/** Começa do primeiro slide. Devolve false se a lista não tem slide (só vídeo/apresentação). */
async function start(
  items: Announcement[],
  nextConfig: CarouselConfig,
  options: { openMain?: boolean } = {},
): Promise<boolean> {
  const built = buildCarouselSlides(items)
  if (built.length === 0) return false
  config.value = { ...nextConfig }
  remote = options.openMain !== false
  slides.value = built
  index.value = 0
  status.value = 'playing'
  deadlineMs = Date.now() + config.value.slideMs
  show()
  startTimer()
  if (options.openMain !== false && (await hasSelectedExtendedProjectionTargets())) {
    projecting.value = await openProjectionModule(CAROUSEL_PROJECTION_MODULE)
  }
  return true
}

function pause() {
  if (status.value !== 'playing') return
  remainingMs = Math.max(0, deadlineMs - Date.now())
  status.value = 'paused'
}

function resume() {
  if (status.value === 'ended') {
    status.value = 'playing'
    deadlineMs = Date.now() + config.value.slideMs
    goTo(0)
    return
  }
  if (status.value !== 'paused') return
  status.value = 'playing'
  deadlineMs = Date.now() + remainingMs
}

/** Manual: o slide novo ganha o tempo inteiro. */
function step(delta: 1 | -1) {
  if (status.value === 'idle') return
  if (status.value === 'ended' && delta === -1) status.value = 'paused'
  const restart = Date.now() + config.value.slideMs
  if (status.value === 'playing') deadlineMs = restart
  else remainingMs = config.value.slideMs
  const total = slides.value.length
  const target = index.value + delta
  if (!config.value.loop && target < 0) return
  if (!config.value.loop && target >= total) {
    status.value = 'ended'
    return
  }
  goTo(target)
}

function next() {
  step(1)
}

function prev() {
  step(-1)
}

function setSlideMs(slideMs: number) {
  config.value = { ...config.value, slideMs }
}

function setLoop(loop: boolean) {
  config.value = { ...config.value, loop }
}

function releaseIndependent() {
  if (!independent.value) return
  independent.value = false
  independentSeen = false
  publishAnnotationRuntime({ ...DEFAULT_ANNOTATION_RUNTIME }, true)
}

/**
 * Antes de abrir a projeção independente (botão Sobrepor/Compartilhar):
 * parado, começa o carrossel só nela; rodando, passa a publicar nela também.
 */
async function prepareIndependent(items: Announcement[], nextConfig: CarouselConfig): Promise<boolean> {
  if (status.value === 'idle' && !(await start(items, nextConfig, { openMain: false }))) return false
  independent.value = true
  independentSeen = false
  show()
  return true
}

function stop() {
  clearTimer()
  if (independent.value) {
    if (isIndependentProjectionActive(CAROUSEL_PROJECTION_MODULE)) closeIndependentProjection(CAROUSEL_PROJECTION_MODULE)
    releaseIndependent()
  }
  const wasProjecting = projecting.value
  projecting.value = false
  if (status.value !== 'idle') {
    publishAnnotationRuntime({ ...DEFAULT_ANNOTATION_RUNTIME }, false)
    publishCarouselRuntime({ ...DEFAULT_CAROUSEL_RUNTIME })
    if (remote) sendRemote()
  }
  remote = false
  status.value = 'idle'
  slides.value = []
  index.value = 0
  if (wasProjecting && isProjectionModuleOpen(CAROUSEL_PROJECTION_MODULE)) closeProjectionModule()
}

export function useAnnouncementsCarousel() {
  return {
    status: readonly(status),
    index: readonly(index),
    total: computed(() => slides.value.length),
    currentSlide: computed(() => slides.value[index.value] ?? null),
    projecting: readonly(projecting),
    independent: readonly(independent),
    isActive: computed(() => status.value !== 'idle'),
    start,
    prepareIndependent,
    pause,
    resume,
    next,
    prev,
    stop,
    setSlideMs,
    setLoop,
    /** Só para testes: avança o relógio sem esperar o intervalo. */
    tick,
  }
}
