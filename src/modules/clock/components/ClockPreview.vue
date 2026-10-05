<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'

import type { StageSettings } from '../../settings/types/stage-settings'
import type { ClockConfig } from '../types/clock'
import { useClockDisplay } from '../composables/useClock'

const props = withDefaults(
  defineProps<{
    config: ClockConfig
    /** Personalização Palco do escopo clock — mesma fonte da projeção. */
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

const {
  config,
  hourAngle,
  minuteAngle,
  secondAngle,
  formattedTime,
  formattedSeconds,
  ampm,
} = useClockDisplay(() => props.config)

const digitalFontSize = computed(() => {
  const st = props.stage
  if (st && sizeWidth.value > 0) {
    return Math.max(16, (st.fontSize / 1920) * sizeWidth.value)
  }
  const v = Math.min(sizeWidth.value, sizeHeight.value)
  const ratio = config.value.showSeconds ? 0.35 : 0.4
  return Math.max(v * ratio, 20)
})

const analogSize = computed(() => {
  const v = Math.min(sizeWidth.value, sizeHeight.value)
  const base = Math.max(v * 0.8, 100)
  const st = props.stage
  if (!st || sizeWidth.value <= 0) return base
  // Escala o analógico junto com o tamanho de fonte do Palco (96 = neutro).
  return Math.max(80, base * (st.fontSize / 96))
})

const accentColor = computed(() => {
  if (props.stage) return props.stage.textColor
  if (props.preview) return 'var(--ds-color-on-surface)'
  return config.value.textColor
})

const digitalStyle = computed(() => {
  const st = props.stage
  const color = accentColor.value
  return {
    fontSize: `${digitalFontSize.value}px`,
    fontWeight: st ? String(st.fontWeight) : '900',
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
  color: accentColor.value,
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
  /* v8 ignore next 1 -- containerRef sempre montado; retry cancelado no unmount */
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
    class="clock-preview"
    :style="surfaceStyle"
  >
    <div
      v-if="config.style === 'digital'"
      class="clock-preview__digital"
      :style="digitalStyle"
    >
      <span>{{ formattedTime }}</span>
      <span
        v-if="config.showSeconds"
        class="clock-preview__seconds"
        :style="{
          fontSize: `${digitalFontSize * 0.5}px`,
          marginBottom: `${digitalFontSize * 0.15}px`,
        }"
      >
        {{ formattedSeconds }}
      </span>
      <span
        v-if="!config.format24h"
        class="clock-preview__ampm"
        :style="{
          fontSize: `${digitalFontSize * 0.3}px`,
          marginBottom: `${digitalFontSize * 0.2}px`,
          fontWeight: stage ? String(Math.min(700, stage.fontWeight)) : undefined,
        }"
      >
        {{ ampm }}
      </span>
    </div>

    <div
      v-else
      class="clock-preview__analog"
      :style="{
        width: `${analogSize}px`,
        height: `${analogSize}px`,
        border: `min(8px, ${analogSize * 0.02}px) solid ${accentColor}`,
        boxShadow: preview
          ? 'none'
          : stage?.textShadow
            ? `inset 0 0 40px rgba(0,0,0,0.2), 0 0 ${stage.shadowBlur}vh rgba(0,0,0,${stage.shadowIntensity})`
            : `inset 0 0 40px ${config.bgColor}40, 0 10px 40px ${accentColor}20`,
      }"
    >
      <div
        class="clock-preview__center"
        :style="{
          width: `${analogSize * 0.06}px`,
          height: `${analogSize * 0.06}px`,
          background: accentColor,
        }"
      />

      <div
        class="clock-preview__hand clock-preview__hand--hour"
        :style="{
          width: `${analogSize * 0.025}px`,
          height: `${analogSize * 0.3}px`,
          background: accentColor,
          left: `calc(50% - ${analogSize * 0.0125}px)`,
          transform: `rotate(${hourAngle}deg)`,
        }"
      />

      <div
        class="clock-preview__hand clock-preview__hand--minute"
        :style="{
          width: `${analogSize * 0.015}px`,
          height: `${analogSize * 0.4}px`,
          background: accentColor,
          left: `calc(50% - ${analogSize * 0.0075}px)`,
          transform: `rotate(${minuteAngle}deg)`,
        }"
      />

      <div
        v-if="config.showSeconds"
        class="clock-preview__hand clock-preview__hand--second"
        :style="{
          width: `${analogSize * 0.005}px`,
          height: `${analogSize * 0.45}px`,
          left: `calc(50% - ${analogSize * 0.0025}px)`,
          transform: `rotate(${secondAngle}deg)`,
        }"
      >
        <div class="clock-preview__second-tail" />
      </div>

      <div
        v-for="i in 12"
        :key="i"
        class="clock-preview__marker-rail"
        :style="{ transform: `rotate(${i * 30}deg)` }"
      >
        <div
          class="clock-preview__marker"
          :style="{
            width: `${i % 3 === 0 ? analogSize * 0.02 : analogSize * 0.01}px`,
            height: `${i % 3 === 0 ? analogSize * 0.06 : analogSize * 0.03}px`,
            marginTop: `${analogSize * 0.02}px`,
            background: accentColor,
            opacity: i % 3 === 0 ? 1 : 0.5,
          }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.clock-preview {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.clock-preview__digital {
  display: flex;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  font-family: system-ui, -apple-system, sans-serif;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.clock-preview__seconds {
  align-self: flex-end;
  margin-left: 0.5rem;
  opacity: 0.7;
}

.clock-preview__ampm {
  align-self: flex-end;
  margin-left: 1rem;
  font-weight: 700;
  opacity: 0.5;
}

.clock-preview__analog {
  position: relative;
  border-radius: 9999px;
}

.clock-preview__center {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 10;
  border-radius: 9999px;
  transform: translate(-50%, -50%);
}

.clock-preview__hand {
  position: absolute;
  bottom: 50%;
  z-index: 7;
  border-radius: 4px;
  transform-origin: bottom center;
  transition: transform 0.05s cubic-bezier(0.4, 2.08, 0.55, 0.44);

  &--minute {
    z-index: 8;
    opacity: 0.8;
  }

  &--second {
    z-index: 9;
    background: #ff3b30;
    transition: none;
  }
}

.clock-preview__second-tail {
  position: absolute;
  top: 100%;
  width: 100%;
  height: 20%;
  background: #ff3b30;
}

.clock-preview__marker-rail {
  position: absolute;
  inset: 0;
}

.clock-preview__marker {
  margin-right: auto;
  margin-left: auto;
  border-radius: 2px;
}
</style>
