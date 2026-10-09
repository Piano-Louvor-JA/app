<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  MEDIA_RUNTIME_CHANNEL,
  MEDIA_RUNTIME_STORAGE_KEY,
  normalizeMediaRuntime,
  readMediaRuntimeFromStorage,
} from '../services/media-runtime'
import { stripHtmlBreaks } from '../services/media-slides'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'
import type { MediaProjectionRuntime } from '../types/media'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'

const runtime = ref<MediaProjectionRuntime>({ ...DEFAULT_MEDIA_PROJECTION })

// Personalização do Palco (escopo hymns)
const stage = ref<StageSettings>(readEffectiveStageSettings('hymns'))
let unsubStage: (() => void) | null = null

let channel: BroadcastChannel | null = null

const lyric = computed(() => stripHtmlBreaks(runtime.value.lyric))
// Título grande SÓ no slide de capa (cover) — slide de letra vazio não deve
// renderizar o nome da música no meio do hino (slides de solfejo/pausa são
// filtrados no buildMediaSlides, mas qualquer slide vazio residual não vira título).
const showTitle = computed(() => runtime.value.isCover)

function applyRuntime(raw: unknown) {
  runtime.value = normalizeMediaRuntime(raw)
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
      applyRuntime(event.data)
    }
  } catch {
    // BroadcastChannel indisponível
  }

  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  channel?.close()
  channel = null
})

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
}))

// BG custom do Palco tem prioridade sobre a capa do álbum (como o APK).
const bgImage = computed(
  () => resolveBackgroundImage(stage.value.backgroundImage) ?? runtime.value.imageUrl,
)

const contentStyle = computed(() => stageFlexAlign(stage.value))

const textStyle = computed(() => ({
  color: stage.value.textColor,
  fontSize: `${(stage.value.fontSize / 1920) * 100}cqw`,
  fontWeight: String(stage.value.fontWeight),
  textAlign: stage.value.textAlign,
  textShadow: stage.value.textShadow
    ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
    : 'none',
}))

// Título (capa) com personalização própria; fallback = estilo geral da letra.
const titleStyle = computed(() => {
  const st = stage.value
  return {
    ...textStyle.value,
    fontSize: `${((st.titleFontSize ?? st.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(st.titleFontWeight ?? st.fontWeight),
    color: st.titleTextColor ?? st.textColor,
    textShadow: (st.titleTextShadow ?? st.textShadow)
      ? `0 0 ${(st.shadowBlur / 108) * 100}cqw rgba(0,0,0,${st.shadowIntensity})`
      : 'none',
    textTransform: st.titleUpperCase ? 'uppercase' : 'none',
  }
})

const boxStyle = computed(() =>
  stage.value.textBox
    ? {
        backgroundColor: `rgba(0,0,0,${stage.value.boxOpacity})`,
        border: stage.value.boxBorder ? '1px solid rgba(255,255,255,0.25)' : 'none',
        // Padrão folha característico do design
        borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
      }
    : {},
)
</script>

<template>
  <div
    class="media-projection"
    :style="stageStyle"
  >
    <div
      v-if="bgImage"
      class="media-projection__bg"
      :style="{ backgroundImage: `url(${bgImage})` }"
      aria-hidden="true"
    />

    <div
      v-if="runtime.active"
      class="media-projection__content"
      :style="contentStyle"
    >
      <p
        v-if="showTitle"
        class="media-projection__title"
        :class="{ 'media-projection__title--cover': runtime.isCover }"
        :style="titleStyle"
      >
        {{ runtime.title }}
      </p>
      <p
        v-if="lyric && !runtime.isCover"
        class="media-projection__lyric"
        :style="[textStyle, boxStyle]"
      >
        {{ lyric }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-projection {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  color: #fff;
  /* container p/ unidades cqw do stage-settings */
  container-type: size;
}

.media-projection__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

.media-projection__content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 4vw;
  text-align: center;
}

.media-projection__title,
.media-projection__lyric {
  margin: 0;
  max-width: 86vw;
  padding: 2.5vmin 4vmin;
  border: clamp(2px, 0.2vmin, 4px) solid rgb(255 255 255 / 0.85);
  border-radius: clamp(14px, 2.4vmin, 32px) 0
    clamp(14px, 2.4vmin, 32px) 0;
  background: rgb(24 24 24 / 0.55);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #fff;
  font-size: clamp(1.75rem, 7.5vmin, 8rem);
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.03em;
  text-align: center;
  text-transform: uppercase;
  white-space: pre-line;
}

.media-projection__title--cover {
  border: none;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: #f6c32a;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-shadow: 0 10px 30px rgb(0 0 0 / 0.9), 0 2px 6px rgb(0 0 0 / 0.7);
}
</style>
