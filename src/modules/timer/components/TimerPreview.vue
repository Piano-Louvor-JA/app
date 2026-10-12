<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, ref } from 'vue'

import type { StageSettings } from '../../settings/types/stage-settings'
import type { TimerDisplayConfig, TimerRuntimeState } from '../types/timer'
import { useTimerDisplay } from '../composables/useTimer'

const props = withDefaults(
  defineProps<{
    config: TimerDisplayConfig
    runtime: TimerRuntimeState
    /** Personalização Palco do escopo timer — mesma fonte da projeção. */
    stage?: StageSettings
    preview?: boolean
  }>(),
  {
    preview: false,
  },
)

const containerRef = useTemplateRef<HTMLElement>('container')
const sizeWidth = ref(0)
const sizeHeight = ref(0)

const { formattedTime } = useTimerDisplay(
  () => props.config,
  () => props.runtime,
)

const digitalFontSize = computed(() => {
  const st = props.stage
  if (st && sizeWidth.value > 0) {
    // fontSize é px @1920 — escala pela largura do container.
    return Math.max(16, (st.fontSize / 1920) * sizeWidth.value)
  }
  const v = Math.min(sizeWidth.value, sizeHeight.value)
  const hasMs = props.config.timeFormat.includes('ms')
  const ratio = hasMs ? 0.28 : 0.36
  return Math.max(v * ratio, 20)
})

const textColor = computed(() => {
  if (props.stage) return props.stage.textColor
  if (props.preview) return 'var(--ds-color-on-surface)'
  return props.config.textColor
})

const digitalStyle = computed(() => {
  const st = props.stage
  const color = textColor.value
  return {
    fontSize: `${digitalFontSize.value}px`,
    fontWeight: st ? String(st.fontWeight) : '800',
    color,
    textAlign: st?.textAlign ?? 'center',
    textShadow:
      props.preview && !st
        ? 'none'
        : st?.textShadow
          ? `0 0 ${st.shadowBlur}vh rgba(0,0,0,${st.shadowIntensity})`
          : st
            ? 'none'
            : `0 4px 30px ${color}40`,
    background: st?.textBox ? `rgba(0,0,0,${st.boxOpacity})` : 'transparent',
    border: st?.textBox && st.boxBorder ? '1px solid rgba(255,255,255,0.25)' : 'none',
    borderRadius: st?.textBox ? '1.4cqw 0 1.4cqw 0' : '0',
    padding: st?.textBox ? '2.5vmin 1.8vmin' : '0',
  } as Record<string, string>
})

const surfaceStyle = computed(() => ({
  background: 'transparent',
  ...stageFlexJustify(props.stage),
}))

function stageFlexJustify(st?: StageSettings): Record<string, string> {
  if (!st) {
    return { alignItems: 'center', justifyContent: 'center' }
  }
  const alignItems =
    st.textVerticalAlign === 'top'
      ? 'flex-start'
      : st.textVerticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'
  const justifyContent =
    st.textAlign === 'left'
      ? 'flex-start'
      : st.textAlign === 'right'
        ? 'flex-end'
        : 'center'
  return { alignItems, justifyContent }
}

let measureTimer: ReturnType<typeof setTimeout> | null = null

function measure() {
  const el = containerRef.value
  /* v8 ignore next 1 -- ref só é null fora do ciclo de vida do componente */
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
    class="timer-preview"
    :style="surfaceStyle"
  >
    <div
      class="timer-preview__digital"
      :style="digitalStyle"
    >
      {{ formattedTime }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.timer-preview {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.timer-preview__digital {
  max-width: 100%;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
