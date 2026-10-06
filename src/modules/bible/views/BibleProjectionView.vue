<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { ProjectionBackground } from '@design-system/index'

import {
  BIBLE_RUNTIME_CHANNEL,
  BIBLE_RUNTIME_STORAGE_KEY,
  DEFAULT_BIBLE_RUNTIME,
  normalizeBibleRuntime,
  readBibleRuntimeFromStorage,
  type BibleProjectionRuntime,
} from '../services/bible-runtime'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'

const props = withDefaults(
  defineProps<{
    /** Preview embutido no app (não usa 100vw/100vh da popup). */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const runtime = ref<BibleProjectionRuntime>({ ...DEFAULT_BIBLE_RUNTIME })
let runtimeChannel: BroadcastChannel | null = null

// Personalização do Palco (escopo bible)
const stage = ref<StageSettings>(readEffectiveStageSettings('bible'))
let unsubStage: (() => void) | null = null

function refreshRuntime() {
  runtime.value = readBibleRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BIBLE_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeBibleRuntime(event.data)
}

onMounted(() => {
  refreshRuntime()
  window.addEventListener('storage', onStorage)

  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('bible')
  })

  try {
    runtimeChannel = new BroadcastChannel(BIBLE_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
})

const showContent = computed(
  () => runtime.value.active && Boolean(runtime.value.text || runtime.value.reference),
)

const contentKey = computed(
  () => `${runtime.value.text}|${runtime.value.reference}`,
)

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))

const stageAlign = computed(() => stageFlexAlign(stage.value, 'row'))

/**
 * Texto bíblico longo cede um pouco de tamanho para caber na área.
 * O slider (bibleFontSize) é a base — sem teto artificial em rem que
 * anulava a personalização do Palco.
 */
const adaptiveBibleFontScale = computed(() => {
  const length = runtime.value.text.replace(/\s+/g, ' ').trim().length
  if (length > 360) return 0.66
  if (length > 260) return 0.76
  if (length > 170) return 0.86
  return 1
})

const verseStyle = computed(() => {
  const cqw =
    (stage.value.bibleFontSize / 1920) * 100 * adaptiveBibleFontScale.value
  return {
    color: stage.value.bibleTextColor,
    fontSize: `${cqw}cqw`,
    fontWeight: String(stage.value.bibleFontWeight),
    textAlign: stage.value.textAlign,
    // Paridade web: capitalização do versículo configurável no Palco.
    textTransform:
      stage.value.bibleTextTransform === 'none' ? 'none' : stage.value.bibleTextTransform,
    textShadow: stage.value.textShadow
      ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
      : 'none',
  }
})

/** Referência sem o sufixo " (versão)" quando o toggle do Palco está off. */
const displayReference = computed(() => {
  const ref = runtime.value.reference.trim()
  if (!ref) return ''
  if (stage.value.showBibleVersion) return ref
  return ref.replace(/\s*\([^)]*\)\s*$/, '').trim()
})

const verseBoxStyle = computed(() => {
  if (!stage.value.textBox) return {}
  return {
    backgroundColor: `rgba(0,0,0,${stage.value.boxOpacity})`,
    border: stage.value.boxBorder ? '1px solid rgba(255,255,255,0.25)' : 'none',
    // Padrão folha característico do design (como o media-projection)
    borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
    // caixinha só no versículo: padding para respirar dentro da caixa
    padding: '0.35em 0.75em',
    // Bíblia: caixa horizontal aproveita a projeção e reduz quebras de verso.
    width: '100%',
    boxSizing: 'border-box' as const,
    margin: '0 auto',
  }
})

const referenceStyle = computed(() => ({
  color: stage.value.footerRefColor,
  fontWeight: String(stage.value.footerRefWeight),
}))
</script>

<template>
  <ProjectionBackground
    class="bible-projection"
    :class="{ 'bible-projection--embedded': embedded }"
    :style="stageStyle"
  >
    <div
      class="bible-projection__stage"
      :style="stageAlign"
    >
      <Transition
        name="bible-fade"
        mode="out-in"
      >
        <div
          v-if="showContent"
          :key="contentKey"
          class="bible-projection__content"
        >
          <p
            v-if="runtime.text"
            class="bible-projection__text"
            :style="[verseStyle, verseBoxStyle]"
          >
            {{ runtime.text }}
          </p>
          <p
            v-if="displayReference"
            class="bible-projection__reference"
            :style="referenceStyle"
          >
            {{ displayReference }}
          </p>
        </div>
        <div
          v-else
          key="empty"
          class="bible-projection__empty"
        />
      </Transition>
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.bible-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  /* container p/ unidades cqw do stage-settings (font-size proporcional) */
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.bible-projection__stage {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  /* Margens mínimas — o versículo usa quase toda a projeção. */
  padding: clamp(0.75rem, 2.5vmin, 1.75rem) clamp(0.5rem, 1.5vmin, 1rem);
}

.bible-projection__content {
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  width: 100%;
  max-width: 100%;
}

.bible-projection__text {
  margin: 0;
  color: #fff;
  /* tamanho/peso/cor vêm do Palco via verseStyle (inline) */
  line-height: 1.4;
  text-align: center;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.7);
  white-space: pre-wrap;
}

.bible-projection__reference {
  margin: 0;
  color: #fb8c00;
  font-size: clamp(1rem, 2.8vmin, 1.85rem);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: right;
  text-transform: uppercase;
}

.bible-projection__empty {
  width: 100%;
  height: 100%;
}

.bible-fade-enter-active,
.bible-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.bible-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.bible-fade-leave-to {
  opacity: 0;
}
</style>
