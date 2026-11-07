<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { ProjectionBackground } from '@design-system/index'
import { isIndependentProjectionLocation } from '@shared/services/projection-window-location'

import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'
import {
  annotationChannelName,
  annotationStorageKey,
  normalizeAnnotationRuntime,
  readAnnotationRuntime,
  type AnnotationProjectionRuntime,
} from '../services/annotation-projection-runtime'
import { notesHtmlToPlainText, sanitizeNotesHtml } from '../services/rich-notes'
import '../styles/rich-notes.css'

withDefaults(
  defineProps<{
    /** Prévia dentro do app (não usa 100vw/100vh da popup). */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const independent = isIndependentProjectionLocation()
const runtime = ref<AnnotationProjectionRuntime>(readAnnotationRuntime(independent))
const stage = ref<StageSettings>(readEffectiveStageSettings('liturgy'))
/** Título sem cor própria usa a cor da referência da Bíblia. */
const BIBLE_REFERENCE_COLOR = '#fb8c00'
const bibleReferenceColor = ref(readBibleReferenceColor())
let channel: BroadcastChannel | null = null
let unsubStage: (() => void) | null = null

function readBibleReferenceColor(): string {
  return readEffectiveStageSettings('bible').footerRefColor ?? BIBLE_REFERENCE_COLOR
}

function onStorage(event: StorageEvent) {
  if (event.key === annotationStorageKey(independent)) runtime.value = readAnnotationRuntime(independent)
}

function onMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeAnnotationRuntime(event.data)
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('liturgy')
    bibleReferenceColor.value = readBibleReferenceColor()
  })
  try {
    channel = new BroadcastChannel(annotationChannelName(independent))
    channel.addEventListener('message', onMessage)
  } catch {
    channel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  channel?.removeEventListener('message', onMessage)
  channel?.close()
  channel = null
})

const html = computed(() => sanitizeNotesHtml(runtime.value.html))
const title = computed(() => runtime.value.title.trim())
const showContent = computed(() => runtime.value.active && Boolean(html.value || title.value))
const contentKey = computed(() => `${title.value}|${html.value}`)

const stageStyle = computed(() => {
  const background = resolveBackgroundImage(stage.value.backgroundImage)
  return {
    backgroundColor: stage.value.backgroundColor ?? '#000000',
    backgroundImage: background ? `url(${background})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const stageAlign = computed(() => stageFlexAlign(stage.value, 'column'))

function cqw(px: number, scale = 1): string {
  return `${(px / 1920) * 100 * scale}cqw`
}

function shadowOf(enabled: boolean): string {
  return enabled
    ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
    : 'none'
}

/** Anotação longa cede tamanho para caber na tela. */
const textScale = computed(() => {
  const length = notesHtmlToPlainText(html.value).replace(/\s+/g, ' ').length
  if (length > 600) return 0.5
  if (length > 360) return 0.6
  if (length > 200) return 0.7
  return 0.8
})

const titleStyle = computed(() => ({
  color: runtime.value.titleColor || stage.value.titleTextColor || bibleReferenceColor.value,
  fontSize: cqw(stage.value.titleFontSize ?? stage.value.fontSize),
  fontWeight: String(stage.value.titleFontWeight ?? stage.value.fontWeight),
  textAlign: stage.value.textAlign,
  textTransform: stage.value.titleUpperCase ? ('uppercase' as const) : ('none' as const),
  textShadow: shadowOf(stage.value.titleTextShadow ?? stage.value.textShadow),
}))

const textStyle = computed(() => ({
  color: stage.value.textColor ?? undefined,
  fontSize: cqw(stage.value.fontSize, textScale.value),
  fontWeight: String(stage.value.fontWeight),
  textAlign: stage.value.textAlign,
  textShadow: shadowOf(stage.value.textShadow),
}))

const boxStyle = computed(() => {
  if (!stage.value.textBox) return {}
  return {
    backgroundColor: `rgba(24,24,24,${stage.value.boxOpacity})`,
    border: stage.value.boxBorder ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)' : 'none',
    borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
    backdropFilter: 'blur(16px)',
    padding: '0.5em 0.9em',
  }
})
</script>

<template>
  <ProjectionBackground
    class="annotation-projection"
    :class="{ 'annotation-projection--embedded': embedded }"
    :style="stageStyle"
  >
    <div
      class="annotation-projection__stage"
      :style="stageAlign"
    >
      <Transition
        name="annotation-fade"
        mode="out-in"
      >
        <div
          v-if="showContent"
          :key="contentKey"
          class="annotation-projection__content"
          data-testid="annotation-projection-content"
        >
          <h1
            v-if="title"
            class="annotation-projection__title"
            :style="titleStyle"
          >
            {{ title }}
          </h1>
          <!-- eslint-disable-next-line vue/no-v-html -- HTML passa por sanitizeNotesHtml -->
          <div
            v-if="html"
            class="annotation-projection__text rich-notes"
            data-testid="annotation-projection-text"
            :style="[textStyle, boxStyle]"
            v-html="html"
          />
        </div>
        <div
          v-else
          key="empty"
          class="annotation-projection__empty"
        />
      </Transition>
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.annotation-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.annotation-projection__stage {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: clamp(1rem, 4vmin, 3rem) clamp(1rem, 5vmin, 4rem);
}

.annotation-projection__content {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  max-width: 100%;
  max-height: 100%;
}

.annotation-projection__title {
  margin: 0;
  color: #fff;
  line-height: 1.2;
}

.annotation-projection__text {
  box-sizing: border-box;
  color: #fff;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.annotation-projection__empty {
  width: 100%;
  height: 100%;
}

.annotation-fade-enter-active,
.annotation-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.annotation-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.annotation-fade-leave-to {
  opacity: 0;
}
</style>
