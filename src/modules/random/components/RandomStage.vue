<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import type { StageSettings } from '../../settings/types/stage-settings'
import type { RandomDisplayConfig, RandomRuntimeState } from '../types/random'

const PARTICLE_COUNT = 20
const FIREWORK_COUNT = 56
const CELEBRATE_MS = 2800

interface OrbParticle {
  id: number
  size: number
  left: number
  top: number
}

interface FireworkSpark {
  id: number
  x: number
  y: number
  size: number
  hue: number
  delay: number
  duration: number
  wave: number
}

function createParticles(): OrbParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, id) => ({
    id,
    size: Math.random() * 4 + 2,
    left: Math.random() * 100,
    top: Math.random() * 100,
  }))
}

function createFireworkBurst(): FireworkSpark[] {
  const sparks: FireworkSpark[] = []
  let id = 0
  for (let wave = 0; wave < 3; wave += 1) {
    const count = wave === 0 ? Math.ceil(FIREWORK_COUNT * 0.4) : Math.ceil(FIREWORK_COUNT * 0.3)
    for (let i = 0; i < count; i += 1) {
      const angle =
        (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55 + wave * 0.31
      // Distância em % do focal: explode bem para fora do orbe.
      const distance = 95 + Math.random() * 120 + wave * 35
      sparks.push({
        id: id++,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 6 + Math.random() * 9 + (wave === 0 ? 3 : 0),
        hue: [28, 42, 18, 52, 8, 35][Math.floor(Math.random() * 6)]!,
        delay: wave * 160 + Math.random() * 140,
        duration: 1000 + Math.random() * 900,
        wave,
      })
    }
  }
  return sparks
}

const props = withDefaults(
  defineProps<{
    config: RandomDisplayConfig
    runtime: RandomRuntimeState
    canDraw?: boolean
    isProjecting?: boolean
    preview?: boolean
    /** Botão Sortear no preview in-app (1 monitor). */
    showDraw?: boolean
    /** Projeção em tela cheia: mesmo visual do operador, escala maior. */
    projection?: boolean
    /** Personalização Palco (cor/tamanho) na projeção. */
    stage?: StageSettings | null
  }>(),
  {
    canDraw: false,
    isProjecting: false,
    preview: false,
    showDraw: false,
    projection: false,
    stage: null,
  },
)

const emit = defineEmits<{
  draw: []
  openConfig: []
}>()

const { t } = useI18n()
const particlesLayerRef = useTemplateRef<HTMLElement>('particlesLayer')
const particles = createParticles()
const celebrating = ref(false)
const fireworks = ref<FireworkSpark[]>([])
let celebrateTimer: ReturnType<typeof setTimeout> | null = null

const animations: Animation[] = []
let cancelled = false
let wasDrawing = false

const hasResult = computed(
  () => props.runtime.currentDisplay.length > 0 && !props.runtime.isDrawing,
)

/** Histórico na ordem do sorteio (1º → último). */
const drawnList = computed(() =>
  Array.isArray(props.runtime.drawn) ? props.runtime.drawn : [],
)

const showDrawnList = computed(
  () => props.projection && drawnList.value.length > 0,
)

const isNamesMode = computed(() => props.runtime.mode !== 'numbers')


const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function clearCelebrate() {
  if (celebrateTimer) {
    clearTimeout(celebrateTimer)
    celebrateTimer = null
  }
  celebrating.value = false
  fireworks.value = []
}

function triggerCelebrate() {
  if (prefersReducedMotion()) return
  clearCelebrate()
  celebrating.value = true
  fireworks.value = createFireworkBurst()
  celebrateTimer = setTimeout(() => {
    celebrating.value = false
    fireworks.value = []
    celebrateTimer = null
  }, CELEBRATE_MS)
}

watch(
  () => props.runtime.isDrawing,
  (drawing, prev) => {
    if (drawing) {
      wasDrawing = true
      clearCelebrate()
      return
    }
    if (wasDrawing && props.runtime.currentDisplay) {
      wasDrawing = false
      triggerCelebrate()
    /* v8 ignore start -- source watches only isDrawing; callback nunca recebe false→false */
    } else if (!prev && !drawing) {
      wasDrawing = false
    }
    /* v8 ignore stop */
  },
)

const statusLabel = computed(() => {
  if (props.runtime.isDrawing) return t('random.drawing')
  if (props.canDraw) return t('random.readyToDraw')
  return t('random.emptyList')
})

const displayText = computed(() => {
  if (props.runtime.currentDisplay) return props.runtime.currentDisplay
  return t('random.placeholderDisplay')
})

const displayStyle = computed(() => {
  const drawing = props.runtime.isDrawing
  const cfg = props.config
  const names = props.runtime.mode !== 'numbers'
  // Nomes usam escala menor: vw alto estourava nomes longos.
  const sizeVw = names ? cfg.fontSizePc * 0.72 : cfg.fontSizePc
  return {
    color: drawing ? 'var(--ds-color-on-surface-variant)' : cfg.textColor,
    fontSize: props.projection
      ? `${drawing ? sizeVw * 0.82 : sizeVw}vw`
      : props.preview
        ? `${Math.min(2.2, Math.max(1.1, cfg.fontSizePc * 0.22))}rem`
        : undefined,
    textTransform: cfg.textTransform,
    textShadow: drawing ? 'none' : `0 10px 40px ${cfg.textColor}60`,
    opacity: props.runtime.currentDisplay || props.preview ? 1 : 0.55,
  }
})

const projectionSurfaceStyle = computed(() => {
  if (!props.projection) return undefined
  return {
    // Fundo da personalização do sorteio (diálogo), quando não há imagem do Palco.
    backgroundColor: props.stage?.backgroundImage ? undefined : props.config.bgColor,
  }
})

function relocateParticle(el: HTMLElement) {
  el.style.left = `${Math.random() * 100}%`
  el.style.top = `${Math.random() * 100}%`
}

function animateParticle(el: HTMLElement) {
  /* v8 ignore next 1 -- chamadas só ocorrem no mount ou após onfinish, ambos guardados por cancelled */
  if (cancelled) return

  const duration = Math.random() * 2000 + 1000
  const x = (Math.random() - 0.5) * 100
  const y = (Math.random() - 0.5) * 100

  const animation = el.animate(
    [
      { transform: 'translate(0, 0)', opacity: 0.6 },
      { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
    ],
    {
      duration,
      easing: 'ease-out',
      fill: 'forwards',
    },
  )

  animations.push(animation)

  animation.onfinish = () => {
    const index = animations.indexOf(animation)
    if (index >= 0) animations.splice(index, 1)
    if (cancelled) return
    relocateParticle(el)
    animateParticle(el)
  }
}

function startParticles() {
  const layer = particlesLayerRef.value
  if (!layer || typeof Element.prototype.animate !== 'function') return

  const nodes = layer.querySelectorAll<HTMLElement>('.random-stage__particle')
  for (const node of nodes) {
    animateParticle(node)
  }
}

function stopParticles() {
  cancelled = true
  for (const animation of animations) {
    animation.cancel()
  }
  animations.length = 0
}

onMounted(() => {
  cancelled = false
  wasDrawing = props.runtime.isDrawing
  startParticles()
})

onUnmounted(() => {
  clearCelebrate()
  stopParticles()
})
</script>

<template>
  <div
    class="random-stage"
    :class="{
      'random-stage--projection': projection,
      'random-stage--celebrate': celebrating,
      'random-stage--names': isNamesMode,
    }"
    :style="projectionSurfaceStyle"
  >
    <div
      v-if="preview"
      class="random-stage__toolbar"
    >
      <button
        type="button"
        class="random-stage__tool"
        :aria-label="t('random.config')"
        :title="t('random.config')"
        @click="emit('openConfig')"
      >
        <i
          class="ti ti-palette"
          aria-hidden="true"
        />
      </button>
    </div>

    <div class="random-stage__focal">
      <div class="random-stage__orbit random-stage__orbit--outer" />
      <div class="random-stage__orbit random-stage__orbit--inner" />

      <div
        v-if="fireworks.length"
        class="random-stage__fireworks"
        aria-hidden="true"
      >
        <span
          v-for="spark in fireworks"
          :key="spark.id"
          class="random-stage__firework"
          :class="{ 'random-stage__firework--core': spark.wave === 0 }"
          :style="{
            '--fx': `${spark.x}%`,
            '--fy': `${spark.y}%`,
            '--fsize': `${spark.size}px`,
            '--fhue': String(spark.hue),
            '--fdelay': `${spark.delay}ms`,
            '--fdur': `${spark.duration}ms`,
          }"
        />
      </div>

      <div
        class="random-stage__orb"
        :class="{ 'random-stage__orb--pulse': celebrating }"
      >
        <div
          ref="particlesLayer"
          class="random-stage__particles"
          aria-hidden="true"
        >
          <span
            v-for="particle in particles"
            :key="particle.id"
            class="random-stage__particle"
            :style="{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
            }"
          />
        </div>
        <div class="random-stage__orb-glow" />
        <div class="random-stage__content">
          <template v-if="runtime.isDrawing || runtime.currentDisplay">
            <span
              v-if="hasResult"
              class="random-stage__winner-label"
              :class="{ 'random-stage__winner-label--pop': celebrating }"
            >
              {{ t('random.winner') }}
            </span>
            <p
              class="random-stage__display"
              :class="{
                'random-stage__display--drawing': runtime.isDrawing,
                'random-stage__display--pulse': celebrating,
              }"
              :style="displayStyle"
            >
              {{ displayText }}
            </p>
          </template>
          <template v-else>
            <i
              class="ti ti-sparkles random-stage__idle-icon"
              aria-hidden="true"
            />
            <p class="random-stage__idle-text">
              {{ t('random.readyToDraw') }}
            </p>
          </template>
        </div>
      </div>
    </div>

    <button
      v-if="preview || showDraw"
      type="button"
      class="random-stage__draw"
      :class="{
        'random-stage__draw--spinning': runtime.isDrawing,
        'random-stage__draw--overlay': projection && showDraw,
      }"
      :disabled="!canDraw"
      :aria-label="t('random.drawButton')"
      @click="emit('draw')"
    >
      <span class="random-stage__draw-circle">
        <i
          class="ti ti-dice"
          aria-hidden="true"
        />
      </span>
      <span class="random-stage__draw-label">
        {{ t('random.drawButton') }}
      </span>
    </button>

    <p
      v-if="preview"
      class="random-stage__hint"
    >
      {{ statusLabel }}
    </p>

    <p
      v-if="preview && isProjecting"
      class="random-stage__projecting"
    >
      <i
        class="ti ti-device-desktop"
        aria-hidden="true"
      />
      {{ t('random.projecting') }}
    </p>

    <aside
      v-if="showDrawnList"
      class="random-stage__drawn"
      :aria-label="t('random.drawn')"
    >
      <header class="random-stage__drawn-head">
        <span class="random-stage__drawn-title">
          {{ t('random.drawn') }}
        </span>
        <span class="random-stage__drawn-count">
          {{ drawnList.length }}
        </span>
      </header>
      <ul class="random-stage__drawn-list">
        <li
          v-for="(item, index) in drawnList"
          :key="`${item}-${index}`"
          class="random-stage__drawn-item"
          :class="{
            'random-stage__drawn-item--latest':
              !runtime.isDrawing && index === drawnList.length - 1,
          }"
        >
          <span class="random-stage__drawn-rank">
            {{ index + 1 }}
          </span>
          <span
            class="random-stage__drawn-name"
            :style="{ textTransform: config.textTransform }"
          >
            {{ item }}
          </span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.random-stage {
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  padding: 1rem;
  overflow: visible;

  &--projection {
    height: 100%;
    padding: 4vmin;
    container-type: size;
    overflow: visible;
  }
}

.random-stage__toolbar {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
}

.random-stage__tool {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  .ti {
    font-size: 1.1rem;
  }
}

.random-stage__focal {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(20rem, 55vw);
  height: min(20rem, 55vw);
  overflow: visible;

  .random-stage--projection & {
    width: min(56vmin, 32rem);
    height: min(56vmin, 32rem);
  }

  /* Nomes: caixa cresce com o texto (sem teto em rem que força quebra). */
  .random-stage--names & {
    width: max-content;
    height: max-content;
    max-width: none;
    min-width: min(10rem, 50vw);
  }

  .random-stage--projection.random-stage--names & {
    max-width: none;
    min-width: min(24vmin, 16rem);
  }
}

.random-stage__orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  translate: -50% -50%;
  border-radius: 9999px;
  pointer-events: none;
  animation: random-orbital 20s linear infinite;

  &--outer {
    width: min(26rem, 70vw);
    height: min(26rem, 70vw);
    border: 2px dashed color-mix(in srgb, var(--ds-color-primary) 12%, transparent);

    .random-stage--projection & {
      width: min(70vmin, 40rem);
      height: min(70vmin, 40rem);
      display: block;
    }

    .random-stage--names & {
      display: none;
    }
  }

  &--inner {
    width: min(22rem, 60vw);
    height: min(22rem, 60vw);
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
    animation-direction: reverse;
    animation-duration: 15s;

    .random-stage--projection & {
      width: min(62vmin, 36rem);
      height: min(62vmin, 36rem);
      display: block;
    }

    .random-stage--names & {
      display: none;
    }
  }
}

.random-stage__orb {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-surface-elevated) 72%, transparent);
  backdrop-filter: blur(16px);
  box-shadow:
    0 0 80px 20px color-mix(in srgb, var(--ds-color-primary) 15%, transparent),
    inset 0 0 40px color-mix(in srgb, var(--ds-color-primary) 10%, transparent);

  .random-stage--names & {
    width: max-content;
    height: max-content;
    max-width: none;
    border-radius: 1.5rem 0 1.5rem 0;
    overflow: visible;
    padding: 2rem 3rem;
  }

  .random-stage--projection.random-stage--names & {
    padding: 4vmin 6.5vmin;
  }
}

.random-stage__particles {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.random-stage__particle {
  position: absolute;
  border-radius: 50%;
  background: var(--ds-color-primary, #9ecaff);
  box-shadow: 0 0 6px color-mix(in srgb, var(--ds-color-primary, #9ecaff) 55%, transparent);
  pointer-events: none;
  opacity: 0.6;
}

.random-stage__orb-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 40%,
    color-mix(in srgb, var(--ds-color-primary) 18%, transparent),
    transparent 70%
  );
}

.random-stage__orb--pulse {
  animation: random-orb-pulse 1.1s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow:
    0 0 100px 36px color-mix(in srgb, var(--ds-color-primary) 35%, transparent),
    inset 0 0 50px color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
}

.random-stage__fireworks {
  position: absolute;
  /* Estende além do focal para as faíscas voarem longe */
  inset: -70%;
  z-index: 4;
  pointer-events: none;
  overflow: visible;
}

.random-stage__firework {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--fsize, 10px);
  height: var(--fsize, 10px);
  margin: calc(var(--fsize, 10px) / -2) 0 0 calc(var(--fsize, 10px) / -2);
  border-radius: 50%;
  background: hsl(var(--fhue, 28) 100% 68%);
  box-shadow:
    0 0 8px 2px hsl(var(--fhue, 28) 100% 70%),
    0 0 20px 6px hsl(var(--fhue, 28) 100% 55% / 0.95),
    0 0 42px 14px hsl(var(--fhue, 28) 100% 45% / 0.55);
  opacity: 0;
  will-change: transform, opacity;
  animation: random-firework var(--fdur, 1.2s) cubic-bezier(0.05, 0.7, 0.12, 1) var(--fdelay, 0ms) both;

  &--core {
    box-shadow:
      0 0 10px 3px hsl(var(--fhue, 28) 100% 78%),
      0 0 28px 10px hsl(var(--fhue, 28) 100% 58%),
      0 0 56px 20px hsl(var(--fhue, 28) 100% 48% / 0.65);
  }

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 300%;
    height: 38%;
    translate: -50% -50%;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--fhue, 28) 100% 85% / 0.95),
      transparent
    );
    filter: blur(0.5px);
  }
}

.random-stage--projection .random-stage__firework {
  width: calc(var(--fsize, 10px) * 1.55);
  height: calc(var(--fsize, 10px) * 1.55);
}

.random-stage--celebrate .random-stage__focal::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 18%;
  height: 18%;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    hsl(38 100% 78% / 0.95) 0%,
    hsl(28 100% 55% / 0.45) 38%,
    transparent 72%
  );
  pointer-events: none;
  animation: random-flash 700ms ease-out both;
}

.random-stage__content {
  position: relative;
  z-index: 3;
  display: flex;
  max-width: 85%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;

  .random-stage--names & {
    width: max-content;
    max-width: none;
    padding: 0;
  }
}

.random-stage__winner-label {
  color: #f6c32a;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-shadow: 0 0 18px color-mix(in srgb, #f6c32a 45%, transparent);

  .random-stage--projection & {
    font-size: clamp(1rem, 2.8vmin, 1.85rem);
    letter-spacing: 0.28em;
  }

  &--pop {
    animation: random-winner-pop 700ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.random-stage__display {
  margin: 0;
  font-size: clamp(1.5rem, 3.2vw, 2.25rem);
  font-weight: 800;
  line-height: 1.15;
  word-break: break-word;
  transition:
    color 300ms ease,
    opacity 200ms ease;

  .random-stage--names & {
    word-break: normal;
    overflow-wrap: normal;
    white-space: nowrap;
  }

  &--drawing {
    opacity: 0.55;
  }

  &--pulse {
    animation: random-display-pulse 1.15s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.random-stage__idle-icon {
  color: color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
  font-size: 3.5rem;

  .random-stage--projection & {
    font-size: clamp(4rem, 12vmin, 8rem);
  }
}

.random-stage__idle-text {
  margin: 0;
  max-width: 11rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  line-height: 1.4;

  .random-stage--projection & {
    max-width: 28rem;
    font-size: clamp(1rem, 2.4vmin, 1.6rem);
  }
}

.random-stage__draw {
  position: relative;
  z-index: 2;
  display: flex;
  margin-top: 2.5rem;
  flex-direction: column;
  align-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &--spinning .random-stage__draw-circle .ti {
    animation: random-dice-spin 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:not(:disabled):hover .random-stage__draw-circle {
    transform: scale(1.08);
  }

  &:not(:disabled):active .random-stage__draw-circle {
    transform: scale(0.95);
  }

  &--overlay {
    position: absolute;
    right: clamp(1.25rem, 4vmin, 3rem);
    top: 50%;
    margin-top: 0;
    transform: translateY(-10%);
    z-index: 25;
    pointer-events: auto;
  }
}

.random-stage__draw-circle {
  display: inline-flex;
  width: 5.5rem;
  height: 5.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--ds-color-primary-container, #2196f3);
  color: var(--ds-color-on-primary-container, #002c4f);
  box-shadow: 0 0 40px color-mix(in srgb, #2196f3 40%, transparent);
  transition: transform 180ms ease;

  .ti {
    font-size: 2.25rem;
  }
}

.random-stage__draw-label {
  margin-top: 0.85rem;
  color: var(--ds-color-primary);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.random-stage__hint {
  position: relative;
  z-index: 2;
  margin: 0.85rem 0 0;
  color: color-mix(in srgb, var(--ds-color-on-surface-variant) 80%, transparent);
  font-size: 0.75rem;
  font-weight: 500;
}

.random-stage__projecting {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 1.25rem 0 0;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;

  .ti {
    font-size: 0.95rem;
  }
}

.random-stage__drawn {
  position: absolute;
  right: 4vmin;
  bottom: 3vmin;
  left: 4vmin;
  z-index: 3;
  display: flex;
  max-height: 26vmin;
  flex-direction: column;
  margin: 0;
  padding: 1.4cqh 1.8cqw;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: 1.6cqw 0 1.6cqw 0;
  background: color-mix(in srgb, #000 42%, transparent);
  backdrop-filter: blur(12px);
  box-sizing: border-box;
  pointer-events: none;
}

.random-stage__drawn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1cqh;
  flex-shrink: 0;
}

.random-stage__drawn-title {
  color: color-mix(in srgb, #fff 82%, transparent);
  font-size: 1.6cqh;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.random-stage__drawn-count {
  display: inline-flex;
  min-width: 2.2cqh;
  height: 2.2cqh;
  align-items: center;
  justify-content: center;
  padding: 0 0.7cqw;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary, #f6a623) 28%, transparent);
  color: #fff;
  font-size: 1.4cqh;
  font-weight: 700;
}

.random-stage__drawn-list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.8cqh 1cqw;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.random-stage__drawn-item {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.6cqw;
  padding: 0.55cqh 1cqw;
  border: 1px solid color-mix(in srgb, #fff 14%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, #fff 8%, transparent);
  color: #fff;

  &--latest {
    border-color: color-mix(in srgb, var(--ds-color-primary, #f6a623) 55%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary, #f6a623) 22%, transparent);
    box-shadow: 0 0 1.5cqh color-mix(in srgb, var(--ds-color-primary, #f6a623) 35%, transparent);
  }
}

.random-stage__drawn-rank {
  display: inline-flex;
  width: 2cqh;
  height: 2cqh;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, #000 35%, transparent);
  font-size: 1.2cqh;
  font-weight: 700;
  opacity: 0.9;
}

.random-stage__drawn-name {
  overflow: hidden;
  font-size: 1.8cqh;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes random-orbital {
  from {
    rotate: 0deg;
  }

  to {
    rotate: 360deg;
  }
}

@keyframes random-dice-spin {
  from {
    transform: rotate(0deg) scale(0.9);
  }

  to {
    transform: rotate(360deg) scale(1);
  }
}

@keyframes random-orb-pulse {
  0% {
    transform: scale(0.92);
  }

  45% {
    transform: scale(1.06);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes random-display-pulse {
  0% {
    transform: scale(0.72);
    opacity: 0.35;
    filter: brightness(1.4);
  }

  55% {
    transform: scale(1.12);
    opacity: 1;
    filter: brightness(1.15);
  }

  100% {
    transform: scale(1);
    opacity: 1;
    filter: none;
  }
}

@keyframes random-winner-pop {
  0% {
    transform: translateY(0.4em) scale(0.8);
    opacity: 0;
  }

  60% {
    transform: translateY(0) scale(1.08);
    opacity: 1;
  }

  100% {
    transform: none;
    opacity: 1;
  }
}

@keyframes random-firework {
  0% {
    transform: translate(0, 0) scale(0.35);
    opacity: 0;
  }

  8% {
    opacity: 1;
    transform: translate(calc(var(--fx, 0%) * 0.08), calc(var(--fy, -40%) * 0.08)) scale(1.45);
  }

  35% {
    opacity: 1;
    transform: translate(calc(var(--fx, 0%) * 0.55), calc(var(--fy, -40%) * 0.55)) scale(1.05);
  }

  100% {
    transform: translate(var(--fx, 0%), var(--fy, -40%)) scale(0.15);
    opacity: 0;
  }
}

@keyframes random-flash {
  0% {
    opacity: 0;
    transform: scale(0.35);
  }

  25% {
    opacity: 0.95;
    transform: scale(2.4);
  }

  100% {
    opacity: 0;
    transform: scale(5.2);
  }
}

@media (max-width: 1100px) {
  .random-stage:not(.random-stage--projection) {
    .random-stage__orbit--outer,
    .random-stage__orbit--inner {
      display: none;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .random-stage__orbit {
    animation: none;
  }

  .random-stage__particle,
  .random-stage__fireworks {
    display: none;
  }

  .random-stage__orb--pulse,
  .random-stage__display--pulse,
  .random-stage__winner-label--pop {
    animation: none;
  }
}

@media (max-width: 1280px) {
  .random-stage {
    padding: 0.5rem;
  }

  .random-stage:not(.random-stage--names) .random-stage__focal {
    width: min(14rem, 45vw);
    height: min(14rem, 45vw);
  }

  .random-stage__orbit--outer {
    width: min(18rem, 55vw);
    height: min(18rem, 55vw);
  }

  .random-stage__orbit--inner {
    width: min(15rem, 48vw);
    height: min(15rem, 48vw);
  }

  .random-stage__idle-icon {
    font-size: 2.5rem;
  }

  .random-stage__draw {
    margin-top: 1.5rem;
  }

  .random-stage__draw-circle {
    width: 4.25rem;
    height: 4.25rem;

    .ti {
      font-size: 1.85rem;
    }
  }

  .random-stage__draw-label {
    margin-top: 0.55rem;
    font-size: 0.75rem;
  }
}
</style>
