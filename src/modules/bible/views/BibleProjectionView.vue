<script setup lang="ts">
import { useProjectionFont } from '@modules/settings/composables/useProjectionFont'
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
import {
  BIBLE_INDEPENDENT_CHANNEL,
  BIBLE_INDEPENDENT_STORAGE_KEY,
  readBibleIndependentFromStorage,
} from '../services/bible-independent-runtime'
import { isIndependentProjectionLocation } from '@shared/services/projection-window-location'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { bibleTransitionMs, resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'

const props = withDefaults(
  defineProps<{
    /** Preview embutido no app (não usa 100vw/100vh da popup). */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const runtime = ref<BibleProjectionRuntime>({ ...DEFAULT_BIBLE_RUNTIME })
/** Projeção independente lê canal próprio (imune ao takeover da principal). */
const independent = isIndependentProjectionLocation()
const runtimeKey = independent ? BIBLE_INDEPENDENT_STORAGE_KEY : BIBLE_RUNTIME_STORAGE_KEY
const runtimeChannelName = independent ? BIBLE_INDEPENDENT_CHANNEL : BIBLE_RUNTIME_CHANNEL
let runtimeChannel: BroadcastChannel | null = null

// Personalização do Palco (escopo bible)
const stage = ref<StageSettings>(readEffectiveStageSettings('bible'))
let unsubStage: (() => void) | null = null

function refreshRuntime() {
  runtime.value = independent ? readBibleIndependentFromStorage() : readBibleRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === runtimeKey) {
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
    runtimeChannel = new BroadcastChannel(runtimeChannelName)
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
  backgroundColor: stage.value.backgroundColor ?? '#000000',
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  '--bible-transition-ms': `${bibleTransitionMs(stage.value.bibleTransitionSpeed)}ms`,
}))

const transitionName = computed(() => `bible-${stage.value.bibleTransition ?? 'fade'}`)

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
    color: stage.value.bibleTextColor ?? undefined,
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
    backgroundColor: `rgba(24,24,24,${stage.value.boxOpacity})`,
    border: stage.value.boxBorder ? 'clamp(2px, 0.2vmin, 4px) solid rgba(255,255,255,0.85)' : 'none',
    // Padrão folha característico do design (como o media-projection)
    borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
    backdropFilter: 'blur(16px)',
    // caixinha só no versículo: padding para respirar dentro da caixa
    padding: '0.35em 0.75em',
    // Bíblia: caixa horizontal aproveita a projeção e reduz quebras de verso.
    width: '100%',
    boxSizing: 'border-box' as const,
    margin: '0 auto',
  }
})

const referenceCorner = computed(() => stage.value.bibleRefPosition === 'corner')

const referenceStyle = computed(() => {
  const position = stage.value.bibleRefPosition ?? 'below-right'
  return {
    color: stage.value.footerRefColor ?? undefined,
    fontSize: `${((stage.value.refFontSize ?? Math.round(stage.value.bibleFontSize * 0.4)) / 1920) * 100}cqw`,
    fontWeight: String(stage.value.footerRefWeight),
    textTransform: stage.value.refTextTransform,
    ...(referenceCorner.value ? {} : { textAlign: position.replace('below-', '') as 'left' | 'center' | 'right' }),
  }
})

const projectionFontStyle = useProjectionFont('bible')
</script>

<template>
  <ProjectionBackground
    class="bible-projection"
    :class="{ 'bible-projection--embedded': embedded }"
    :style="[stageStyle, projectionFontStyle]"
  >
    <div
      class="bible-projection__stage"
      :style="stageAlign"
    >
      <Transition
        :name="transitionName"
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
            v-if="displayReference && !referenceCorner"
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
      <!-- Fora do conteúdo: o transform da transição moveria o canto junto. -->
      <Transition
        :name="transitionName"
        mode="out-in"
      >
        <p
          v-if="showContent && displayReference && referenceCorner"
          :key="contentKey"
          class="bible-projection__reference bible-projection__reference--corner"
          :style="referenceStyle"
        >
          {{ displayReference }}
        </p>
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
  position: relative;
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

.bible-projection__reference--corner {
  position: absolute;
  right: clamp(1rem, 3vmin, 2.5rem);
  bottom: clamp(0.75rem, 2.5vmin, 1.75rem);
}

.bible-projection__empty {
  width: 100%;
  height: 100%;
}

/* bible-none não tem regra: o Vue troca o versículo sem animar. */
.bible-fade-enter-active,
.bible-fade-leave-active,
.bible-slide-enter-active,
.bible-slide-leave-active,
.bible-zoom-enter-active,
.bible-zoom-leave-active {
  transition:
    opacity var(--bible-transition-ms, 250ms) ease,
    transform var(--bible-transition-ms, 250ms) ease;
}

.bible-fade-enter-from,
.bible-fade-leave-to {
  opacity: 0;
}

.bible-slide-enter-from {
  opacity: 0;
  transform: translateY(4vh);
}

.bible-slide-leave-to {
  opacity: 0;
  transform: translateY(-2vh);
}

.bible-zoom-enter-from {
  opacity: 0;
  transform: scale(0.94);
}

.bible-zoom-leave-to {
  opacity: 0;
  transform: scale(1.03);
}

@media (prefers-reduced-motion: reduce) {
  .bible-slide-enter-from,
  .bible-slide-leave-to,
  .bible-zoom-enter-from,
  .bible-zoom-leave-to {
    transform: none;
  }
}
</style>
