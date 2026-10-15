<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { stripHtmlBreaks } from '../services/media-slides'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import {
  resolveBackgroundImage,
  stageBgCss,
  coverTitleTextShadow,
  stageFlexAlign,
  type StageSettings,
} from '../../settings/types/stage-settings'

const props = defineProps<{
  lyric: string
  title: string
  imageUrl: string | null
  subtitle?: string
  isCover?: boolean
}>()

const { t } = useI18n()

// Paridade: palco do operador é a superfície de REFERÊNCIA — lê as mesmas
// StageSettings do scope 'hymns' que a projeção e os receivers aplicam.
const stage = ref<StageSettings>(readEffectiveStageSettings('hymns'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('hymns')
  })
})
onUnmounted(() => unsubStage?.())

const plainLyric = computed(() => stripHtmlBreaks(props.lyric))
const showTitleAsLyric = computed(
  () => Boolean(props.isCover) || (!plainLyric.value && Boolean(props.title)),
)
// Título (capa) com personalização própria; fallback = estilo geral.
const titleColor = computed(
  () => stage.value.titleTextColor ?? stage.value.textColor ?? '#f6c32a',
)

const coverSubtitle = computed(() => {
  const subtitle = (props.subtitle ?? '').trim()
  const title = (props.title ?? '').trim()
  if (!subtitle || subtitle.localeCompare(title, undefined, { sensitivity: 'accent' }) === 0) {
    return ''
  }
  return subtitle
})

const titleStyle = computed(() => {
  const s = stage.value
  return {
    color: titleColor.value,
    fontSize: `${((s.titleFontSize ?? s.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(s.titleFontWeight ?? s.fontWeight),
    textAlign: s.textAlign,
    textTransform: s.titleUpperCase ? 'uppercase' : 'none',
    textShadow: coverTitleTextShadow(Boolean(s.titleTextShadow ?? s.textShadow), titleColor.value),
    ...(s.titleTextBox
      ? {
          backgroundColor: `rgba(24,24,24,${s.boxOpacity})`,
          border: s.boxBorder
            ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)'
            : 'none',
          borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
          backdropFilter: 'blur(16px)',
          '-webkit-backdrop-filter': 'blur(16px)',
        }
      : {}),
    padding: '1.6vmin 1.8vmin',
  } as Record<string, string>
})

const displayText = computed(() => {
  if (showTitleAsLyric.value) return props.title || t('media.title')
  return plainLyric.value
})

// BG: custom do usuário VENCE a imagem da música (paridade com a projeção:
// resolveBackgroundImage(bg) ?? imageUrl). Cor de fundo quando não há imagem.
const bgImage = computed(
  () => resolveBackgroundImage(stage.value.backgroundImage) ?? props.imageUrl,
)
const rootStyle = computed(() => ({
  backgroundColor: stageBgCss(stage.value.backgroundColor),
}))
const contentStyle = computed(() => stageFlexAlign(stage.value))

// Estilo da letra = personalização do usuário; caixa só quando textBox on.
const lyricStyle = computed(() => {
  const s = stage.value
  return {
    color: s.textColor ?? '#fff',
    fontSize: `${(s.fontSize / 1920) * 100}cqw`,
    fontWeight: String(s.fontWeight),
    textAlign: s.textAlign,
    textTransform: s.lyricUpperCase ? 'uppercase' : 'none',
    textShadow: s.textShadow
      ? `0 0 ${(s.shadowBlur / 108) * 100}cqw rgba(0,0,0,${s.shadowIntensity})`
      : 'none',
    padding: '0.75em 1.25em',
    ...(s.textBox
      ? {
          backgroundColor: `rgba(24,24,24,${s.boxOpacity})`,
          border: s.boxBorder
            ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)'
            : 'none',
          borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
          backdropFilter: 'blur(16px)',
          '-webkit-backdrop-filter': 'blur(16px)',
        }
      : {}),
  } as Record<string, string>
})
</script>

<template>
  <div class="media-slide-stage" :style="rootStyle">
    <div
      v-if="bgImage"
      class="media-slide-stage__bg"
      :style="{ backgroundImage: `url(${bgImage})` }"
      aria-hidden="true"
    />
    <div
      class="media-slide-stage__content"
      :class="{ 'media-slide-stage__content--cover': isCover }"
      :style="isCover ? undefined : contentStyle"
    >
      <div
        v-if="isCover"
        class="media-slide-stage__titlecard"
        :class="{ 'media-slide-stage__titlecard--boxed': stage.titleTextBox }"
        :style="{ color: titleColor }"
      >
        <span
          class="media-slide-stage__titlemark media-slide-stage__titlemark--tl"
          aria-hidden="true"
        />
        <span
          class="media-slide-stage__titlemark media-slide-stage__titlemark--br"
          aria-hidden="true"
        />
        <p
          v-if="coverSubtitle"
          class="media-slide-stage__kicker"
        >{{ coverSubtitle }}</p>
        <p
          class="media-slide-stage__lyric media-slide-stage__lyric--cover"
          :style="titleStyle"
        >
          {{ displayText }}
        </p>
      </div>
      <p
        v-else
        class="media-slide-stage__lyric"
        :style="lyricStyle"
      >
        {{ displayText }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-slide-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  /* cqw = % da LARGURA deste painel (não da janela). Paridade de tamanho
     com a projeção: 5cqw = 5% da superfície em ambas — o palco do operador
     mostra o texto na MESMA proporção, adaptado ao painel sem estourar
     (14/10 Rafael). */
  container-type: size;
}

.media-slide-stage__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: brightness(0.42);
}

.media-slide-stage__content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8vh 6vw;
  text-align: center;

  &--cover {
    padding: 8vh 6vw;
  }
}

.media-slide-stage__lyric {
  margin: 0;
  max-width: 86%;
  /* Caixa/typo/uppercase vêm do lyricStyle (StageSettings do scope) —
     paridade total com projeção/receiver. Nada hardcoded aqui. */
  line-height: 1.4;
  white-space: pre-line;

  &--cover {
    border: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: #f6c32a;
    font-size: clamp(1.8rem, 5.2vw, 3.8rem);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: 0.04em;
  }
}

.media-slide-stage__titlecard {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8cqw;
  max-width: 88%;
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
    .media-slide-stage__titlemark {
      display: none;
    }
  }
}

.media-slide-stage__titlemark {
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

.media-slide-stage__kicker {
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
  .media-slide-stage__titlecard {
    animation: none;
  }
}
</style>
