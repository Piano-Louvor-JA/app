<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CountdownDisplayConfig, CountdownRuntimeState } from '../types/countdown'
import { useCountdownDisplay } from '../composables/useCountdown'

const props = withDefaults(
  defineProps<{
    config: CountdownDisplayConfig
    runtime: CountdownRuntimeState
    preview?: boolean
  }>(),
  {
    preview: false,
  },
)

const { t } = useI18n()

const { formattedTime, formattedTimeWithSign, isUrgent, isFinished, isNegative } = useCountdownDisplay(
  () => props.config,
  () => props.runtime,
)

// web#175: a fonte agora é 100% CSS (container queries cqh/cqi) — o cálculo
// JS por ResizeObserver criava loop de medição e dígitos presos no tamanho
// antigo quando o preview caía no min-height.

const surfaceStyle = computed(() => ({
  background: 'transparent',
  color: props.preview
    ? isNegative.value
      ? '#ff6b6b'
      : isFinished.value // NOSONAR
        ? 'var(--ds-color-error, #ffb4ab)'
        : isUrgent.value // NOSONAR
          ? '#ffa726'
          : 'var(--ds-color-on-surface)'
    : isNegative.value
      ? '#ff6b6b'
      : isFinished.value // NOSONAR
        ? '#ff6b6b'
        : isUrgent.value // NOSONAR
          ? '#ffa726'
          : props.config.textColor,
}))

</script>

<template>
  <div
      ref="container"
      class="countdown-preview"
      :class="{
        'countdown-preview--urgent': isUrgent,
        'countdown-preview--finished': isFinished,
        'countdown-preview--negative': isNegative,
      }"
      :style="surfaceStyle"
    >
      <div
        class="countdown-preview__digital"
        :style="{
          textShadow: preview ? 'none' : '0 4px 30px rgba(0, 0, 0, 0.35)',
        }"
      >
        {{ formattedTimeWithSign }}
      </div>
    <div
      v-if="isFinished"
      class="countdown-preview__finished"
    >
      {{ t('countdown.finished') }}
    </div>
  </div>
</template>

<style scoped lang="scss">
/* web#175: fonte do display via container query — escala com o PRÓPRIO
   container, sem loop de medicação JS (a versão anterior calculava a fonte
   pela altura antiga e ficava presa quando o preview caía no min-height,
   cortando os dígitos — prints 961×906 do Ezequias). */
.countdown-preview {
  container-type: size;
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  gap: 0.5rem;
}

.countdown-preview__digital {
  width: 100%;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  /* 12% da altura do container, limitado a 28% da largura e entre 2rem e 24rem */
  font-size: clamp(2rem, min(24cqh, 28cqi), 24rem);
  /* web#175: line-height 1 deixava o descender do dígito colado/cortado na
     base do painel — o counter "alinha no footer" visualmente */
  line-height: 1.15;
  padding-bottom: 0.06em;
}

.countdown-preview__finished {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.9;
}

.countdown-preview--urgent .countdown-preview__digital {
  animation: countdown-pulse 1s ease-in-out infinite;
}

.countdown-preview--negative .countdown-preview__digital {
  animation: countdown-blink 1s step-end infinite;
}

@keyframes countdown-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
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
</style>
