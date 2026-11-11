<script setup lang="ts">
/**
 * Preview 16:9 da personalização do Palco — paridade com o preview do
 * StageCustomizationSheet do APK: mostra o BG real (imagem/dataURL ou
 * cor), texto de amostra com sombra/caixinha/alinhamentos e (modo Bíblia)
 * rodapé de referência.
 */
import { computed } from 'vue'
import { useProjectionFont } from '../composables/useProjectionFont'

import { resolveBackgroundImage, stageBgCss, stageFlexAlign, type StageSettings } from '../types/stage-settings'

const props = defineProps<{
  settings: StageSettings
  fontScope?: string
  module?: string
}>()

const projectionFontStyle = useProjectionFont(() => props.fontScope ?? props.module ?? 'global')

const sample = computed(() =>
  props.module === 'bible'
    ? 'Porque Deus amou o mundo de tal maneira'
    : 'O nosso sol\nVeio iluminar',
)

const footer = computed(() =>
  props.module === 'bible' ? 'João 3:16 — ARC' : null,
)

const containerStyle = computed(() => {
  const s = props.settings
  return {
    // Hinos: null deixa a capa aparecer. Bíblia não tem capa — o palco é preto.
    backgroundColor:
      props.module === 'bible'
        ? (s.backgroundColor ?? '#000000')
        : stageBgCss(s.backgroundColor),
    backgroundImage: resolveBackgroundImage(s.backgroundImage)
      ? `url(${resolveBackgroundImage(s.backgroundImage)})`
      : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    ...stageFlexAlign(s),
  } as Record<string, string>
})

const textStyle = computed(() => {
  const s = props.settings
  const isBible = props.module === 'bible'
  return {
    color: (isBible ? s.bibleTextColor : s.textColor) ?? undefined,
    // 96px @1920 → 5% da largura do preview (font-size em cqw)
    fontSize: `${((isBible ? s.bibleFontSize : s.fontSize) / 1920) * 100}cqw`,
    fontWeight: String(isBible ? s.bibleFontWeight : s.fontWeight),
    textAlign: s.textAlign,
    // Paridade web: capitalização do versículo no preview da Bíblia.
    textTransform:
      isBible && s.bibleTextTransform !== 'none' ? s.bibleTextTransform : 'none',
    textShadow: s.textShadow
      ? `0 0 ${(s.shadowBlur / 108) * 100}cqw rgba(0,0,0,${s.shadowIntensity})`
      : 'none',
  } as Record<string, string>
})

const boxStyle = computed(() => {
  const s = props.settings
  if (!s.textBox) return {}
  return {
    backgroundColor: `rgba(24,24,24,${s.boxOpacity})`,
    border: s.boxBorder ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)' : 'none',
    // Padrão folha característico do design (como o media-projection)
    borderRadius: '1.4cqw 0 1.4cqw 0',
    backdropFilter: 'blur(16px)',
    '-webkit-backdrop-filter': 'blur(16px)',
  }
})

const footerCorner = computed(() => props.settings.bibleRefPosition === 'corner')

const footerStyle = computed(() => {
  const position = props.settings.bibleRefPosition ?? 'below-right'
  return {
    color: props.settings.footerRefColor ?? undefined,
    fontSize: `${((props.settings.refFontSize ?? Math.round(props.settings.bibleFontSize * 0.4)) / 1920) * 100}cqw`,
    fontWeight: String(props.settings.footerRefWeight),
    textTransform: props.settings.refTextTransform,
    ...(footerCorner.value ? {} : { textAlign: position.replace('below-', '') as 'left' | 'center' | 'right' }),
  }
})
</script>

<template>
  <div
    class="stage-preview"
    :class="{ 'stage-preview--bible': module === 'bible' }"
    :style="[containerStyle, projectionFontStyle]"
  >
    <div class="stage-preview__content">
      <div
        class="stage-preview__box"
        :style="boxStyle"
      >
        <p
          class="stage-preview__text"
          :style="textStyle"
        >
          {{ sample }}
        </p>
      </div>
      <p
        v-if="footer && settings.showBibleVersion"
        class="stage-preview__footer"
        :class="{ 'stage-preview__footer--corner': footerCorner }"
        :style="footerStyle"
      >
        {{ footer }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stage-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  container-type: inline-size;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--ds-radius-lg, 12px);
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 15%, transparent);
}

.stage-preview__box {
  display: flex;
  max-width: calc(100% - 12.5cqw); /* margin 120px @1920 — hinos/geral */
  padding: 2cqw;
  /* radius (padrão folha) vem inline do boxStyle quando textBox ativo */
}

/* Hinos: a caixa segue sendo o filho alinhado pelo palco. */
.stage-preview__content {
  display: contents;
}

/* Bíblia: usa quase toda a largura (paridade com BibleProjectionView);
   a referência "abaixo do texto" fica logo embaixo da caixa. */
.stage-preview--bible .stage-preview__content {
  display: flex;
  flex-direction: column;
  gap: 1cqw;
  width: calc(100% - 2cqw);
}

.stage-preview--bible .stage-preview__box {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.stage-preview__text {
  margin: 0;
  line-height: 1.35;
  white-space: pre-line;
  /* alinhamento horizontal vem inline (textStyle); largura mínima
     para o box acompanhar o texto quando não estica (left/right) */
  width: fit-content;
}

.stage-preview--bible .stage-preview__text {
  width: 100%;
}

.stage-preview__footer {
  margin: 0;
  font-size: 2.2cqw;
}

.stage-preview__footer--corner {
  position: absolute;
  right: 3cqw;
  bottom: 2.2cqw;
}
</style>
