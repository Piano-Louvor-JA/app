<script setup lang="ts">
import { computed } from 'vue'

import type { StageSettings } from '../../settings/types/stage-settings'
import type { RandomDisplayConfig, RandomRuntimeState } from '../types/random'

const props = defineProps<{
  config: RandomDisplayConfig
  runtime: RandomRuntimeState
  /** Personalização Palco do escopo Sorteio — mesma fonte do receiver. */
  stage?: StageSettings
}>()

const surfaceStyle = computed(() => ({
  // Com imagem do Palco, ProjectionBackground já pinta o bg. Não cobrir
  // com o bg legado do Sorteio; sem imagem, mantém o visual legado.
  background: props.stage?.backgroundImage ? 'transparent' : props.config.bgColor,
  color: props.stage?.textColor ?? props.config.textColor,
}))

const textStyle = computed(() => {
  const st = props.stage
  const drawing = props.runtime.isDrawing
  return {
    fontSize: st ? `${(st.fontSize / 1920) * 100}vw` : (drawing ? `${props.config.fontSizePc * 0.8}vw` : `${props.config.fontSizePc}vw`),
    fontWeight: st?.fontWeight ?? 900,
    textTransform: st ? 'uppercase' : props.config.textTransform,
    textShadow: drawing || st?.textShadow === false ? 'none' : (st ? `0 0 ${st.shadowBlur}vw rgba(0,0,0,${st.shadowIntensity})` : `0 10px 40px ${props.config.textColor}60`),
    background: st?.textBox && !drawing ? `rgba(24,24,24,${st.boxOpacity})` : 'transparent',
    border: st?.textBox && st.boxBorder && !drawing ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,.85)' : 'none',
    borderRadius: st?.textBox ? '1.4cqw 0 1.4cqw 0' : '0',
    padding: st?.textBox ? '2.5vmin 1.8vmin' : '0 2.5rem',
    opacity: props.runtime.currentDisplay ? 1 : 0,
  }
})
</script>

<template>
  <div
    class="random-preview"
    :style="surfaceStyle"
  >
    <Transition
      name="random-preview-slide"
      mode="out-in"
    >
      <div
        :key="runtime.isDrawing ? 'drawing' : runtime.currentDisplay"
        class="random-preview__text"
        :style="textStyle"
      >
        {{ runtime.currentDisplay }}
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.random-preview {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.random-preview__text {
  width: 100%;
  padding: 0 2.5rem;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  word-break: break-word;
  transition: all 300ms ease-out;
}

.random-preview-slide-enter-active,
.random-preview-slide-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.random-preview-slide-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}

.random-preview-slide-leave-to {
  opacity: 0;
  transform: translateY(-1rem);
}
</style>
