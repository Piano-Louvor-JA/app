<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import RandomAvailablePanel from '../components/RandomAvailablePanel.vue'
import RandomConfigDialog from '../components/RandomConfigDialog.vue'
import RandomHistoryPanel from '../components/RandomHistoryPanel.vue'
import RandomStage from '../components/RandomStage.vue'
import { useRandomFeature } from '../composables/useRandom'
import { appConfirm } from '@shared/composables/useAppConfirm'
import { decodeTextFileBytes } from '@shared/services/text-encoding'
import type { RandomDrawMode } from '../types/random'

const { t } = useI18n()
const router = useRouter()

const {
  config,
  session,
  runtime,
  draftName,
  isProjecting,
  configOpen,
  rangeError,
  canDraw,
  drawnReversed,
  audioPlaying,
  setMode,
  setNumberMin,
  setNumberMax,
  setDraftName,
  addName,
  removeAvailable,
  clearAvailable,
  removeDrawn,
  clearHistory,
  resetAll,
  importNamesFromText,
  generateNumberRange,
  startDraw,
  setBgColor,
  setTextColor,
  setFontSizePc,
  setTextTransform,
  setAnimationSpeed,
  resetDisplayToDefault,
  useDefaultDrawAudio,
  useCustomDrawAudio,
  chooseCustomDrawAudio,
  removeCustomDrawAudio,
  togglePreviewDrawAudio,
  setAudioVolume,
  toggleAudioMuted,
  openConfig,
  closeConfig,
} = useRandomFeature()

function goBack() {
  void router.push({ name: 'utilities' })
}

async function onResetAll() {
  const confirmed = await appConfirm({
    title: t('random.resetAll'),
    message: t('random.resetConfirm'),
    confirmLabel: t('random.resetAll'),
    danger: true,
  })
  if (confirmed) {
    resetAll()
  }
}

async function onRemoveCustomAudio(fileName: string) {
  const confirmed = await appConfirm({
    title: t('random.deleteAudioTitle'),
    message: t('random.deleteAudioConfirm', { name: fileName }),
    confirmLabel: t('random.deleteAudio'),
    danger: true,
  })
  if (!confirmed) return
  await removeCustomDrawAudio(fileName)
}

function onModeChange(mode: RandomDrawMode) {
  setMode(mode)
}

async function onImportFile(file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const text = decodeTextFileBytes(bytes)
    importNamesFromText(text)
  } catch {
    // falha de leitura: mantém lista atual
  }
}

const stage = ref<StageSettings>(readEffectiveStageSettings('random'))
let unsubStage: (() => void) | null = null
onMounted(() => { unsubStage = subscribeStageSettings(() => { stage.value = readEffectiveStageSettings('random') }) })
onUnmounted(() => unsubStage?.())

// Personalização do diálogo do sorteio tem prioridade sobre o sub-bloco do Palco.
const effectiveConfig = computed(() => {
  const mod = stage.value.random
  return mod ? { ...mod, ...config.value } : { ...config.value }
})
</script>

<template>
  <section class="random-view">
    <header class="random-view__header">
      <PalcoRouteSelect module="random" />
      <button
        type="button"
        class="random-view__back"
        :aria-label="t('random.backToUtilities')"
        @click="goBack"
      >
        <i
          class="ti ti-arrow-left"
          aria-hidden="true"
        />
      </button>

      <div class="random-view__brand">
        <div class="random-view__brand-icon">
          <i
            class="ti ti-ticket"
            aria-hidden="true"
          />
        </div>
        <h1 class="random-view__title">
          {{ t('random.title') }}
        </h1>

        <div
          class="random-view__modes"
          role="radiogroup"
          :aria-label="t('random.title')"
        >
          <button
            type="button"
            class="random-view__mode"
            :class="{ 'random-view__mode--active': session.mode === 'names' }"
            role="radio"
            :aria-checked="session.mode === 'names'"
            @click="onModeChange('names')"
          >
            {{ t('random.modeNames') }}
          </button>
          <button
            type="button"
            class="random-view__mode"
            :class="{ 'random-view__mode--active': session.mode === 'numbers' }"
            role="radio"
            :aria-checked="session.mode === 'numbers'"
            @click="onModeChange('numbers')"
          >
            {{ t('random.modeNumbers') }}
          </button>
        </div>
      </div>

      <button
        type="button"
        class="random-view__reset"
        @click="onResetAll"
      >
        <i
          class="ti ti-refresh"
          aria-hidden="true"
        />
        {{ t('random.resetAll') }}
      </button>
    </header>


    <div class="random-view__content">
      <div class="random-view__panel random-view__panel--available">
        <RandomAvailablePanel
          :mode="session.mode"
          :available="session.available"
          :drawn="session.drawn"
          :draft-name="draftName"
          :number-min="session.numberMin"
          :number-max="session.numberMax"
          :range-error="rangeError"
          @update:draft-name="setDraftName"
          @update:number-min="setNumberMin"
          @update:number-max="setNumberMax"
          @add="addName()"
          @import-file="onImportFile"
          @generate-range="generateNumberRange"
          @remove="removeAvailable"
          @clear="clearAvailable"
        />
      </div>

      <div class="random-view__stage">
        <RandomStage
          :config="effectiveConfig"
          :runtime="runtime"
          :can-draw="canDraw"
          :is-projecting="isProjecting"
          preview
          @draw="startDraw"
          @open-config="openConfig"
        />
      </div>

      <div class="random-view__panel random-view__panel--history">
        <RandomHistoryPanel
          :items="drawnReversed"
          :total-count="session.drawn.length"
          :audio-source="config.audioSource"
          :custom-audio-files="config.customAudioFiles"
          :custom-audio-file="config.customAudioFile"
          :audio-volume="config.audioVolume"
          :audio-muted="config.audioMuted"
          :audio-playing="audioPlaying"
          @undo="removeDrawn"
          @clear="clearHistory"
          @use-default-audio="useDefaultDrawAudio"
          @use-custom-audio="useCustomDrawAudio"
          @choose-audio="chooseCustomDrawAudio"
          @remove-custom-audio="onRemoveCustomAudio"
          @toggle-audio="togglePreviewDrawAudio"
          @toggle-mute="toggleAudioMuted"
          @update:audio-volume="setAudioVolume"
        />
      </div>
    </div>

    <RandomConfigDialog
      :open="configOpen"
      :config="config"
      @close="closeConfig"
      @update:bg-color="setBgColor"
      @update:text-color="setTextColor"
      @update:font-size-pc="setFontSizePc"
      @update:text-transform="setTextTransform"
      @update:animation-speed="setAnimationSpeed"
      @reset="resetDisplayToDefault"
    />
  </section>
</template>

<style scoped lang="scss">
.random-view {
  display: flex;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  padding: 0.65rem clamp(1rem, 2vw, 1.5rem) 1rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.random-view__header {
  display: flex;
  width: 100%;
  max-width: 80rem;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.65rem;
}

.random-view__back {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition: background-color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.random-view__brand {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
}

.random-view__brand-icon {
  display: flex;
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.35rem;
  }
}

.random-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.random-view__modes {
  display: inline-flex;
  margin-left: 0.5rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  border-radius: 0.65rem 0 0.65rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.random-view__mode {
  height: 2.15rem;
  padding: 0 0.9rem;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 700;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.random-view__reset {
  display: inline-flex;
  height: 2.35rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.95rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-error, #ffb4ab) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 14%, transparent);
  color: var(--ds-color-error, #ffb4ab);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;

  .ti {
    font-size: 1.05rem;
  }
}

.random-view__content {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 80rem;
  flex: 1 1 auto;
  align-items: stretch;
  justify-content: space-between;
  gap: clamp(1.5rem, 3vw, 3rem);
  min-height: 0;
  overflow: visible;

  // Desktop médio / 1024×768: densidade (electron usa flex, não grid).
  @media (max-width: 1280px) {
    gap: 0.75rem;
  }
}

.random-view__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 0 0 auto;
  align-self: stretch;
  min-height: 0;

  &--available,
  &--history {
    transform: none;
  }

  :deep(.random-available),
  :deep(.random-history) {
    height: 100%;
    max-height: none;
  }
}

.random-view__stage {
  position: relative;
  z-index: 20;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-width: 18rem;
  max-width: 28rem;
  margin-inline: auto;
  overflow: visible;
}

/* Header wrap pode ocorrer um pouco antes; empilhar conteúdo só em ≤960 (como no web). */
@media (max-width: 1100px) {
  .random-view__header {
    flex-wrap: wrap;
  }

  .random-view__brand {
    flex-wrap: wrap;
  }

  .random-view__modes {
    margin-left: 0;
  }
}

@media (max-width: 960px) {
  .random-view__content {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 1.5rem;
  }

  .random-view__stage {
    max-width: none;
    min-width: 0;
    order: -1;
  }
}
</style>
