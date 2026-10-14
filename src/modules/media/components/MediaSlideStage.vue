<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { stripHtmlBreaks } from '../services/media-slides'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import {
  resolveBackgroundImage,
  stageBgCss,
  stageFlexAlign,
  type StageSettings,
} from '../../settings/types/stage-settings'

const props = defineProps<{
  lyric: string
  title: string
  imageUrl: string | null
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
const titleStyle = computed(() => {
  const s = stage.value
  return {
    color: s.titleTextColor ?? s.textColor ?? '#f6c32a',
    fontSize: `${((s.titleFontSize ?? s.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(s.titleFontWeight ?? s.fontWeight),
    textAlign: s.textAlign,
    textTransform: s.titleUpperCase ? 'uppercase' : 'none',
    textShadow: (s.titleTextShadow ?? s.textShadow)
      ? `0 0 ${(s.shadowBlur / 108) * 100}cqw rgba(0,0,0,${s.shadowIntensity})`
      : 'none',
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
      <p
        class="media-slide-stage__lyric"
        :class="{ 'media-slide-stage__lyric--cover': isCover }"
        :style="isCover ? titleStyle : lyricStyle"
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
    line-height: 1.1;
    letter-spacing: -0.01em;
    text-shadow: 0 10px 30px rgb(0 0 0 / 0.9), 0 2px 6px rgb(0 0 0 / 0.7);
  }
}
</style>
