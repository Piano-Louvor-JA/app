<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { resolveMediaUrl } from '@shared/services/workspace-api'

import type { StageSettings } from '../../settings/types/stage-settings'
import type { CountdownDisplayConfig, CountdownRuntimeState } from '../types/countdown'
import { useCountdownDisplay } from '../composables/useCountdown'
import { computeElapsedMs } from '../services/countdown-format'

const props = withDefaults(
  defineProps<{
    config: CountdownDisplayConfig
    runtime: CountdownRuntimeState
    /** Personalização Palco do escopo countdown — mesma fonte da projeção. */
    stage?: StageSettings
    preview?: boolean
    /** Vídeo sem som: só a projeção toca o áudio do vídeo. */
    muted?: boolean
  }>(),
  {
    preview: false,
    muted: false,
  },
)

const { t } = useI18n()
const containerRef = useTemplateRef<HTMLElement>('container')
const sizeWidth = ref(0)
const sizeHeight = ref(0)

const { formattedTime, formattedTimeWithSign, isUrgent, isFinished, isNegative } = useCountdownDisplay(
  () => props.config,
  () => props.runtime,
)

/** "Continuar após zerar": passado o zero, segue contando com sinal negativo. */
const displayTime = computed(() =>
  props.config.allowNegative && isNegative.value ? formattedTimeWithSign.value : formattedTime.value,
)

const digitalFontSize = computed(() => {
  const st = props.stage
  if (st && sizeWidth.value > 0) {
    return Math.max(16, (st.fontSize / 1920) * sizeWidth.value)
  }
  const v = Math.min(sizeWidth.value, sizeHeight.value)
  const hasMs = props.config.timeFormat.includes('ms')
  const ratio = hasMs ? 0.28 : 0.36
  return Math.max(v * ratio, 20)
})

const baseTextColor = computed(() => {
  if (isFinished.value) {
    return props.preview ? 'var(--ds-color-error, #ff5252)' : '#ff3b30'
  }
  if (isUrgent.value) return '#ffa726'
  if (props.stage) return props.stage.textColor ?? '#FFFFFF'
  if (props.preview) return 'var(--ds-color-on-surface)'
  return props.config.textColor
})

const digitalStyle = computed(() => {
  const st = props.stage
  const color = baseTextColor.value
  return {
    fontSize: `${digitalFontSize.value}px`,
    fontWeight: st ? String(st.fontWeight) : '800',
    color,
    textAlign: st?.textAlign ?? 'center',
    textShadow:
      isFinished.value || isUrgent.value
        ? `0 0 1.2vh rgba(0,0,0,0.45)`
        : st?.textShadow
          ? `0 0 ${st.shadowBlur}vh rgba(0,0,0,${st.shadowIntensity})`
          : st
            ? 'none'
            : props.preview
              ? 'none'
              : '0 4px 30px rgba(0, 0, 0, 0.35)',
    background: st?.textBox && !isFinished.value ? `rgba(24,24,24,${st.boxOpacity})` : 'transparent',
    border:
      st?.textBox && st.boxBorder && !isFinished.value
        ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)'
        : 'none',
    borderRadius: st?.textBox ? '1.4cqw 0 1.4cqw 0' : '0',
    padding: st?.textBox ? '2.5vmin 1.8vmin' : '0',
    backdropFilter: st?.textBox ? 'blur(16px)' : 'none',
  } as Record<string, string>
})

const surfaceStyle = computed(() => ({
  background: 'transparent',
  color: baseTextColor.value,
  ...stageFlexColumn(props.stage),
}))

/** Container em coluna: alinhamento vertical = justify, horizontal = align. */
function stageFlexColumn(st?: StageSettings): Record<string, string> {
  if (!st) {
    return { alignItems: 'center', justifyContent: 'center' }
  }
  const justifyContent =
    st.textVerticalAlign === 'top'
      ? 'flex-start'
      : st.textVerticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'
  const alignItems =
    st.textAlign === 'left'
      ? 'flex-start'
      : st.textAlign === 'right'
        ? 'flex-end'
        : 'center'
  return { alignItems, justifyContent }
}

/** Vídeo personalizado no lugar dos números, preso ao tempo da contagem. */
const videoUrl = computed(() => (props.runtime.videoPath ? resolveMediaUrl(props.runtime.videoPath) : null))
const videoRef = useTemplateRef<HTMLVideoElement>('video')
/** Abaixo disso o vídeo segue o próprio relógio; pular a cada ajuste travaria a imagem. */
const VIDEO_DRIFT_S = 1

function syncVideo() {
  const video = videoRef.value
  if (!video) return
  const rt = props.runtime
  const elapsedMs = Math.min(rt.durationMs, computeElapsedMs(rt.accumulatedMs, rt.segmentStartedAt, rt.status, Date.now()))
  const target = elapsedMs / 1000
  video.volume = rt.videoVolume ?? 1
  if (Math.abs(video.currentTime - target) > VIDEO_DRIFT_S) video.currentTime = target
  if (rt.status === 'running' && !rt.finished) {
    if (video.paused) void video.play().catch(() => undefined)
  } else if (!video.paused) {
    video.pause()
  }
}

watch(
  () => [
    videoUrl.value,
    props.runtime.status,
    props.runtime.accumulatedMs,
    props.runtime.segmentStartedAt,
    props.runtime.finished,
    props.runtime.videoVolume,
  ],
  () => void nextTick(syncVideo),
  { immediate: true },
)

let measureTimer: ReturnType<typeof setTimeout> | null = null

function measure() {
  const el = containerRef.value
  /* v8 ignore next 1 -- measure só roda com o componente montado (mount/resize/timer) */
  if (!el) return
  sizeWidth.value = el.offsetWidth
  sizeHeight.value = el.offsetHeight

  if ((sizeWidth.value <= 0 || sizeHeight.value <= 0) && measureTimer === null) {
    measureTimer = setTimeout(() => {
      measureTimer = null
      measure()
    }, 100)
  }
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})

onUnmounted(() => {
  if (measureTimer !== null) {
    clearTimeout(measureTimer)
    measureTimer = null
  }
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    ref="container"
    class="countdown-preview"
    :class="{
      'countdown-preview--urgent': isUrgent,
      'countdown-preview--finished': isFinished,
    }"
    :style="surfaceStyle"
  >
    <video
      v-if="videoUrl"
      ref="video"
      class="countdown-preview__video"
      :src="videoUrl"
      :muted="muted"
      preload="auto"
      playsinline
      @loadedmetadata="syncVideo"
    />
    <template v-else>
      <div
        class="countdown-preview__digital"
        :style="digitalStyle"
      >
        {{ displayTime }}
      </div>
      <div
        v-if="isFinished"
        class="countdown-preview__finished"
      >
        {{ t('countdown.finished') }}
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.countdown-preview {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  gap: 0.5rem;
}

.countdown-preview__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.countdown-preview__digital {
  max-width: 100%;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.countdown-preview__finished {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.95;
}

.countdown-preview--urgent .countdown-preview__digital {
  animation: countdown-pulse 1s ease-in-out infinite;
}

.countdown-preview--finished .countdown-preview__digital {
  animation: countdown-overtime-pulse 0.85s ease-in-out infinite;
}

.countdown-preview--finished .countdown-preview__finished {
  animation: countdown-overtime-pulse 0.85s ease-in-out infinite;
}

@keyframes countdown-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.72;
  }
}

@keyframes countdown-overtime-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.7;
    transform: scale(1.04);
  }
}
</style>
