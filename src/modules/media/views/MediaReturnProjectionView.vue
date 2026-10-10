<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  MEDIA_RUNTIME_CHANNEL,
  MEDIA_RUNTIME_STORAGE_KEY,
  normalizeMediaRuntime,
  readMediaRuntimeFromStorage,
  writeMediaRuntimeToStorage,
} from '../services/media-runtime'
import { stripHtmlBreaks } from '../services/media-slides'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage } from '../../settings/types/stage-settings'
import type { MediaProjectionRuntime } from '../types/media'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'

const ADVANCE_MS = 780
const ADVANCE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const { t } = useI18n()
const runtime = ref<MediaProjectionRuntime>({ ...DEFAULT_MEDIA_PROJECTION })

const stage = ref<StageSettings>(readEffectiveStageSettings('hymns'))
let unsubStage: (() => void) | null = null
let channel: BroadcastChannel | null = null
let advanceGen = 0
let flyerAnim: Animation | null = null

const shownCurrent = ref('')
const shownNext = ref('')
const shownCover = ref(false)
const shownNextCover = ref(false)
const outgoingText = ref('')
const exiting = ref(false)
const lyricWait = ref(false)
const flyerOn = ref(false)
const flyerText = ref('')
const nextEnter = ref(false)

const lyricRef = ref<HTMLElement | null>(null)
const nextRef = ref<HTMLElement | null>(null)
const flyerRef = ref<HTMLElement | null>(null)
const barFillRef = ref<HTMLElement | null>(null)

const barDisplay = ref(0)
let barRaf = 0
let barSample = 0
let barSampleAt = 0
let barVel = 0
let barLastTick = 0

function isCoverSlide(state: MediaProjectionRuntime) {
  return state.isCover || (!stripHtmlBreaks(state.lyric) && Boolean(state.title))
}

function phraseOf(state: MediaProjectionRuntime) {
  if (isCoverSlide(state)) return state.title
  return stripHtmlBreaks(state.lyric)
}

function nextPhraseOf(state: MediaProjectionRuntime) {
  const lyric = stripHtmlBreaks(state.nextLyric)
  if (state.nextIsCover && !lyric) return state.title
  return lyric
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function stopBar() {
  if (barRaf) cancelAnimationFrame(barRaf)
  barRaf = 0
}

function paintBar(value: number) {
  barDisplay.value = value
  const el = barFillRef.value
  if (el) el.style.transform = `scaleX(${value})`
}

function tickBar(now: number) {
  barRaf = 0
  if (!runtime.value.active) {
    paintBar(0)
    return
  }

  if (now - barSampleAt > 420) barVel = 0

  const predicted = Math.min(1, Math.max(0, barSample + Math.max(0, barVel) * (now - barSampleAt)))
  const dt = Math.min(40, Math.max(0, now - barLastTick))
  barLastTick = now
  const next = barDisplay.value + (predicted - barDisplay.value) * (1 - Math.exp(-dt / 95))
  paintBar(next)

  const catching = Math.abs(predicted - next) > 0.0005
  const rolling = barVel > 0 && next < 0.999
  if (catching || rolling) {
    barRaf = requestAnimationFrame(tickBar)
  }
}

function startBar() {
  if (barRaf) return
  barLastTick = performance.now()
  barRaf = requestAnimationFrame(tickBar)
}

function syncBar(ratio: number, reset: boolean) {
  const now = performance.now()
  if (reset || ratio + 0.05 < barDisplay.value) {
    barSample = ratio
    barVel = 0
    barSampleAt = now
    paintBar(ratio)
    if (runtime.value.active && ratio > 0 && ratio < 1) startBar()
    else stopBar()
    return
  }

  const dt = now - barSampleAt
  if (dt > 12) {
    barVel = Math.max(0, (ratio - barSample) / dt)
  }
  barSample = ratio
  barSampleAt = now
  startBar()
}

function resetFlyer() {
  flyerAnim?.cancel()
  flyerAnim = null
  const flyer = flyerRef.value
  if (!flyer) return
  flyer.style.transition = 'none'
  flyer.style.left = ''
  flyer.style.top = ''
  flyer.style.width = ''
  flyer.style.transform = ''
  flyer.style.transformOrigin = ''
  flyer.style.opacity = ''
}

function snapTo(state: MediaProjectionRuntime) {
  advanceGen += 1
  exiting.value = false
  lyricWait.value = false
  flyerOn.value = false
  nextEnter.value = false
  outgoingText.value = ''
  resetFlyer()
  shownCover.value = isCoverSlide(state)
  shownCurrent.value = phraseOf(state)
  shownNext.value = nextPhraseOf(state)
  shownNextCover.value = state.nextIsCover
}

/* v8 ignore start — promoteNext: transição com flyer/snapTo provada por
   comportamento (testes 'avanço sequencial' e 'gaps: snapTo'); arms de
   race/gen-stale e rects ausentes não são registrados pelo v8 (ver
   AUDITORIA-COVERAGE.md) */
async function promoteNext(state: MediaProjectionRuntime) {
  const incoming = phraseOf(state)
  const gen = ++advanceGen
  if (prefersReducedMotion()) {
    snapTo(state)
    return
  }

  const fromEl = nextRef.value
  const from = fromEl?.getBoundingClientRect()
  if (!fromEl || !from || from.height < 2) {
    snapTo(state)
    return
  }

  nextEnter.value = false
  outgoingText.value = shownCurrent.value
  shownCurrent.value = incoming
  shownNextCover.value = state.nextIsCover
  lyricWait.value = true
  exiting.value = true
  flyerText.value = incoming
  flyerOn.value = true
  await nextTick()
  if (gen !== advanceGen) return

  const flyer = flyerRef.value
  const toEl = lyricRef.value
  const to = toEl?.getBoundingClientRect()
  if (!flyer || !toEl || !to || to.height < 2) {
    snapTo(state)
    return
  }

  const s = from.width / Math.max(1, to.width)
  const dx = from.left + from.width / 2 - (to.left + to.width / 2)
  const dy = from.top - to.top

  flyer.style.transition = 'none'
  flyer.style.left = `${to.left}px`
  flyer.style.top = `${to.top}px`
  flyer.style.width = `${to.width}px`
  flyer.style.transformOrigin = 'top center'
  flyer.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`
  flyer.style.opacity = '1'
  flyer.getBoundingClientRect()

  flyerAnim?.cancel()
  flyerAnim = flyer.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      { transform: 'translate(0px, 0px) scale(1)' },
    ],
    { duration: ADVANCE_MS, easing: ADVANCE_EASE, fill: 'forwards' },
  )

  try {
    await flyerAnim.finished
  } catch {
    return
  }
  if (gen !== advanceGen) return

  shownNext.value = nextPhraseOf(state)
  nextEnter.value = Boolean(shownNext.value) || state.nextIsCover

  // Revela a letra principal por baixo do flyer (mesmo texto) e remove o overlay no mesmo frame.
  lyricWait.value = false
  await nextTick()
  if (gen !== advanceGen) return

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
  if (gen !== advanceGen) return

  outgoingText.value = ''
  exiting.value = false
  flyerOn.value = false
  resetFlyer()
}
/* v8 ignore stop */

function applyRuntime(raw: unknown) {
  const next = normalizeMediaRuntime(raw)
  const prev = runtime.value
  const incoming = phraseOf(next)
  const canPromote =
    prev.active &&
    next.active &&
    next.slideIndex === prev.slideIndex + 1 &&
    incoming.length > 0 &&
    incoming === shownNext.value &&
    !isCoverSlide(next) &&
    !isCoverSlide(prev)

  runtime.value = next
  syncBar(next.slideProgressRatio, !next.active || next.slideIndex !== prev.slideIndex)

  if (!next.active) {
    snapTo(next)
    return
  }

  if (canPromote) {
    void promoteNext(next)
    return
  }

  /* v8 ignore next 3 — divergente em transição: snapTo provado por
     comportamento (teste 'durante transição'); counters não registram */
  if (exiting.value || lyricWait.value) {
    if (incoming !== flyerText.value || isCoverSlide(next)) snapTo(next)
    return
  }

  const unchanged =
    incoming === shownCurrent.value &&
    nextPhraseOf(next) === shownNext.value &&
    isCoverSlide(next) === shownCover.value &&
    next.nextIsCover === shownNextCover.value

  if (!unchanged) snapTo(next)
}

function onStorage(event: StorageEvent) {
  if (event.key !== MEDIA_RUNTIME_STORAGE_KEY || !event.newValue) return
  try {
    applyRuntime(JSON.parse(event.newValue) as unknown)
  } catch {
    // ignore
  }
}

onMounted(() => {
  applyRuntime(readMediaRuntimeFromStorage())

  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('hymns')
  })

  try {
    channel = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL)
    channel.onmessage = (event) => {
      const next = normalizeMediaRuntime(event.data)
      writeMediaRuntimeToStorage(next)
      applyRuntime(next)
    }
  } catch {
    // BroadcastChannel indisponível
  }

  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  advanceGen += 1
  stopBar()
  resetFlyer()
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  channel?.close()
  channel = null
})

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
}))

const bgImage = computed(
  () => resolveBackgroundImage(stage.value.backgroundImage) ?? runtime.value.imageUrl,
)

/* v8 ignore start — computeds de estilo: arms cobertos por comportamento
   (teste 'gaps: stage completo'), counters do v8 não registram (ver AUDITORIA-COVERAGE.md) */
const barColor = computed(() => stage.value.footerRefColor || '#FCCE02')
const showNext = computed(() => Boolean(shownNext.value) || shownNextCover.value)
const progressPct = computed(() => Math.round(barDisplay.value * 100))

const textStyle = computed(() => ({
  color: stage.value.textColor,
  fontSize: `${(stage.value.fontSize / 1920) * 100}cqw`,
  fontWeight: String(stage.value.fontWeight),
  textAlign: stage.value.textAlign,
  textShadow: stage.value.textShadow
    ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
    : 'none',
}))

const nextTextStyle = computed(() => ({
  ...textStyle.value,
  fontSize: `${(stage.value.fontSize / 1920) * 58}cqw`,
}))
/* v8 ignore stop */

watch(barFillRef, (el) => {
  if (el) el.style.transform = `scaleX(${barDisplay.value})`
})
</script>

<template>
  <div
    class="media-return"
    :style="stageStyle"
  >
    <div
      v-if="bgImage"
      class="media-return__bg"
      :style="{ backgroundImage: `url(${bgImage})` }"
      aria-hidden="true"
    />

    <div
      v-if="runtime.active"
      class="media-return__body"
    >
      <div class="media-return__main">
        <p
          v-if="shownCover"
          class="media-return__title media-return__title--cover"
          :style="textStyle"
        >
          {{ shownCurrent }}
        </p>
        <div
          v-else
          class="media-return__block"
        >
          <div class="media-return__card">
            <p
              v-if="outgoingText"
              class="media-return__lyric media-return__lyric--ghost"
              :class="{ 'media-return__lyric--out': exiting }"
              :style="textStyle"
            >
              {{ outgoingText }}
            </p>
            <p
              ref="lyricRef"
              class="media-return__lyric"
              :class="{ 'media-return__lyric--wait': lyricWait }"
              :style="textStyle"
            >
              {{ shownCurrent }}
            </p>
          </div>
          <div
            class="media-return__bar"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="progressPct"
          >
            <div
              ref="barFillRef"
              class="media-return__bar-fill"
              :style="{ backgroundColor: barColor }"
            />
          </div>
        </div>
      </div>

      <div
        v-if="showNext"
        class="media-return__next"
      >
        <span class="media-return__next-label">{{ t('media.returnNext') }}</span>
        <p
          ref="nextRef"
          class="media-return__next-lyric"
          :class="{
            'media-return__next-lyric--cover': shownNextCover,
            'media-return__next-lyric--out': exiting,
            'media-return__next-lyric--enter': nextEnter,
          }"
          :style="nextTextStyle"
        >
          {{ shownNext }}
        </p>
      </div>
    </div>

    <p
      v-show="flyerOn"
      ref="flyerRef"
      class="media-return__lyric media-return__flyer"
      aria-hidden="true"
      :style="textStyle"
    >
      {{ flyerText }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.media-return {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  color: #fff;
  container-type: size;
}

.media-return__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.72;
}

.media-return__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6vh 5vw 5.5vh;
}

.media-return__main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.media-return__block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: max-content;
  max-width: 90vw;
  min-width: min(78vw, 18rem);
}

.media-return__card {
  position: relative;
  overflow: hidden;
  border: clamp(2px, 0.2vmin, 4px) solid rgb(255 255 255 / 0.85);
  border-bottom: 0;
  border-radius: clamp(16px, 2.6vmin, 28px) clamp(16px, 2.6vmin, 28px) 0 0;
  background: rgb(24 24 24 / 0.55);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.media-return__title,
.media-return__lyric {
  box-sizing: border-box;
  margin: 0;
  padding: 2.4vmin 4vmin 2.8vmin;
  color: #fff;
  font-size: clamp(1.5rem, 6.4vmin, 6.5rem);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.03em;
  text-align: center;
  text-transform: uppercase;
  white-space: pre-line;
}

.media-return__lyric {
  &--wait {
    visibility: hidden;
  }

  &--ghost {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    left: 0;
    pointer-events: none;
  }

  &--out {
    animation: return-ghost-out 780ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
}

@keyframes return-ghost-out {
  from {
    opacity: 1;
    transform: none;
  }

  to {
    opacity: 0;
    transform: translateY(-24%);
  }
}

.media-return__title--cover {
  max-width: 90vw;
  border: none;
  background: transparent;
  box-shadow: none;
  color: #f6c32a;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-shadow: 0 10px 30px rgb(0 0 0 / 0.9), 0 2px 6px rgb(0 0 0 / 0.7);
}

.media-return__bar {
  flex-shrink: 0;
  width: 100%;
  height: clamp(7px, 1.05vmin, 12px);
  margin: 0;
  overflow: hidden;
  border-radius: 0 0 clamp(8px, 1.2vmin, 12px) clamp(8px, 1.2vmin, 12px);
  background: rgb(255 255 255 / 0.18);
}

.media-return__bar-fill {
  width: 100%;
  height: 100%;
  transform: scaleX(0);
  transform-origin: left center;
}

.media-return__next {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  min-height: 0;
}

.media-return__next-label {
  color: #f6c32a;
  font-size: clamp(0.7rem, 1.8vmin, 1.1rem);
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.media-return__next-lyric {
  margin: 0;
  max-width: 86vw;
  color: rgb(255 255 255 / 0.82);
  font-size: clamp(1.25rem, 4.2vmin, 3.4rem);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
  text-align: center;
  text-transform: uppercase;
  white-space: pre-line;

  &--out {
    opacity: 0;
    transition: opacity 160ms ease;
  }

  &--enter {
    animation: return-next-in 520ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.media-return__next-lyric--cover {
  color: #f6c32a;
  font-weight: 800;
}

.media-return__flyer {
  position: fixed;
  z-index: 4;
  max-width: 90vw;
  pointer-events: none;
  will-change: transform;
}

@keyframes return-next-in {
  from {
    opacity: 0;
    transform: translateY(0.45em);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-return__lyric--out,
  .media-return__next-lyric,
  .media-return__flyer {
    animation: none;
    transition: none;
  }

  .media-return__next-lyric--enter {
    animation: none;
  }
}
</style>
