<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'

import {
  MEDIA_RUNTIME_CHANNEL,
  MEDIA_RUNTIME_STORAGE_KEY,
  normalizeMediaRuntime,
  readMediaRuntimeFromStorage,
  writeMediaRuntimeToStorage,
} from '../services/media-runtime'
import { stripHtmlBreaks } from '../services/media-slides'
import { coverTitleTextShadow } from '../services/media-cover-style'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage, stageFlexAlign,
  stageBgCss } from '../../settings/types/stage-settings'
import type { MediaProjectionRuntime } from '../types/media'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'

const runtime = ref<MediaProjectionRuntime>({ ...DEFAULT_MEDIA_PROJECTION })

// Personalização do Palco (escopo hymns)
const stage = ref<StageSettings>(readEffectiveStageSettings('hymns'))
let unsubStage: (() => void) | null = null

let channel: BroadcastChannel | null = null

const lyric = computed(() => stripHtmlBreaks(runtime.value.lyric))
// SOLUÇÃO EZEQUIAS (web, 3dc37df): SEM fit JS. white-space:pre-line no CSS
// faz as quebras \n virarem linhas E o texto fluir até a max-width antes
// de quebrar — quebra natural do browser, largura sempre aproveitada.
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
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  channel?.close()
  channel = null
})

const stageStyle = computed(() => ({
  backgroundColor: stageBgCss(stage.value.backgroundColor),
}))

// BG custom do Palco tem prioridade sobre a capa do álbum (como o APK).
const bgImage = computed(
  () => resolveBackgroundImage(stage.value.backgroundImage) ?? runtime.value.imageUrl,
)

const contentStyle = computed(() => stageFlexAlign(stage.value))

const textStyle = computed(() => ({
  color: stage.value.textColor ?? undefined,
  fontSize: `${(stage.value.fontSize / 1920) * 100}cqw`,
  fontWeight: String(stage.value.fontWeight),
  textAlign: stage.value.textAlign,
  textShadow: stage.value.textShadow
    ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
    : 'none',
}))

// Título (capa) com personalização própria; fallback = estilo geral.
// Cor/box: SEM default inline — a classe --cover (amarelo, sem caixa) só
// vale quando o usuário NÃO personalizou; personalização vence (14/10).
const titleColor = computed(
  () => stage.value.titleTextColor ?? stage.value.textColor ?? '#f6c32a',
)

const coverSubtitle = computed(() => {
  const subtitle = runtime.value.subtitle.trim()
  const title = runtime.value.title.trim()
  if (!subtitle || subtitle.localeCompare(title, undefined, { sensitivity: 'accent' }) === 0) {
    return ''
  }
  return subtitle
})

const titleStyle = computed(() => {
  const st = stage.value
  return {
    ...textStyle.value,
    fontSize: `${((st.titleFontSize ?? st.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(st.titleFontWeight ?? st.fontWeight),
    color: st.titleTextColor ?? st.textColor ?? undefined,
    textShadow: coverTitleTextShadow(Boolean(st.titleTextShadow ?? st.textShadow), titleColor.value),
    textTransform: st.titleUpperCase ? 'uppercase' : 'none',
  }
})
// Caixa no título: default = SEM caixa (padrão capa amarela 14/10 Rafael);
// só aparece quando o usuário liga 'titleTextBox'.
const titleBoxStyle = computed(() =>
  stage.value.titleTextBox
    ? {
        ...boxStyle.value,
        padding: '1.6vmin 1.8vmin',
      }
    : {},
)

// Estrofes com personalização própria; fallback = estilo geral.
const lyricStyle = computed(() => {
  const st = stage.value
  return {
    ...textStyle.value,
    fontSize: `${((st.lyricFontSize ?? st.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(st.lyricFontWeight ?? st.fontWeight),
    color: st.lyricTextColor ?? st.textColor ?? undefined,
    textShadow: (st.lyricTextShadow ?? st.textShadow)
      ? `0 0 ${(st.shadowBlur / 108) * 100}cqw rgba(0,0,0,${st.shadowIntensity})`
      : 'none',
    textTransform: st.lyricUpperCase ? 'uppercase' : 'none',
  }
})
const boxStyle = computed(() =>
  stage.value.textBox
    ? {
        backgroundColor: `rgba(24,24,24,${stage.value.boxOpacity})`,
        border: stage.value.boxBorder ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)' : 'none',
        // Padrão folha característico do design
        borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
        backdropFilter: 'blur(16px)',
        '-webkit-backdrop-filter': 'blur(16px)',
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
      <div
        v-if="showTitle"
        class="media-projection__titlecard"
        :class="{ 'media-projection__titlecard--boxed': stage.titleTextBox }"
        :style="{ color: titleColor }"
      >
        <span
          class="media-projection__titlemark media-projection__titlemark--tl"
          aria-hidden="true"
        />
        <span
          class="media-projection__titlemark media-projection__titlemark--br"
          aria-hidden="true"
        />
        <p
          v-if="coverSubtitle"
          class="media-projection__kicker"
        >{{ coverSubtitle }}</p>
        <p
          class="media-projection__title media-projection__title--cover"
          :style="[titleStyle, titleBoxStyle]"
        >
          {{ runtime.title }}
        </p>
      </div>
      <p
        v-if="lyric && !runtime.isCover"
        class="media-projection__lyric"
        :style="[lyricStyle, boxStyle]"
      >{{ lyric }}</p>
    </div>
  </div>
  <div
    v-if="runtime.active && runtime.frameDataUrl"
    class="media-projection__frame"
    :style="{
      backgroundImage: `url(${runtime.frameDataUrl})`,
      filter: 'brightness(1) saturate(1) contrast(1) blur(0px)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }"
    aria-hidden="true"
  />
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

/* Reflexo das personalizações (05/10 Rafael): fonte/cor/sombra/caixa vêm
   das settings via :style (lyricStyle/titleStyle/boxStyle) — o CSS aqui só
   dá o esqueleto. NADA fixo de cor/borda/fundo que compita com o :style. */
.media-projection__title,
.media-projection__lyric {
  margin: 0;
  width: fit-content;
  max-width: min(100%, 1600px);
  padding: 1.6vmin 1.8vmin;
  border-radius: clamp(14px, 2.4vmin, 32px) 0
    clamp(14px, 2.4vmin, 32px) 0;
  line-height: 1.4;
  letter-spacing: 0.03em;
  text-align: center;
  /* Ezequias/web: quebras \n viram linhas; o resto flui até a max-width */
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
  line-height: 1.15;
  letter-spacing: 0.04em;
}

.media-projection__titlecard {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8cqw;
  max-width: min(88%, 1600px);
  padding: 3.6cqw 5cqw 3.8cqw;
  text-align: center;
  animation: media-titlecard-in 780ms cubic-bezier(0.22, 1, 0.36, 1) both;

  &::before {
    content: '';
    position: absolute;
    z-index: -1;
    left: 50%;
    top: 52%;
    width: 96cqw;
    height: 42cqw;
    transform: translate(-50%, -50%);
    background: radial-gradient(
      ellipse at center,
      rgb(0 0 0 / 0.34) 0%,
      rgb(0 0 0 / 0.14) 46%,
      rgb(0 0 0 / 0.05) 72%,
      transparent 100%
    );
    filter: blur(1.4cqw);
    pointer-events: none;
  }

  &--boxed {
    padding: 0;

    &::before,
    .media-projection__titlemark {
      display: none;
    }
  }
}

.media-projection__titlemark {
  position: absolute;
  width: 3.6cqw;
  height: 3.6cqw;
  pointer-events: none;

  &--tl {
    top: 0.2cqw;
    left: 0.2cqw;
    border-top: 0.28cqw solid currentColor;
    border-left: 0.28cqw solid currentColor;
    border-top-left-radius: 2cqw;
  }

  &--br {
    right: 0.2cqw;
    bottom: 0.2cqw;
    border-right: 0.28cqw solid currentColor;
    border-bottom: 0.28cqw solid currentColor;
    border-bottom-right-radius: 2cqw;
  }
}

.media-projection__kicker {
  margin: 0;
  max-width: 100%;
  padding-left: 0.34em;
  color: #fff;
  font-size: 1.45cqw;
  font-weight: 700;
  letter-spacing: 0.34em;
  line-height: 1.2;
  text-transform: uppercase;
  text-shadow: 0 0.08em 0.22em rgb(0 0 0 / 0.85);
}

@keyframes media-titlecard-in {
  from {
    opacity: 0;
    transform: translateY(1.2cqw);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-projection__titlecard {
    animation: none;
  }
}
</style>
