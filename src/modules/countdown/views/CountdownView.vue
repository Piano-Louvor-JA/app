<script setup lang="ts">
import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, type StageSettings } from '../../settings/types/stage-settings'


import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import CountdownConfigDialog from '../components/CountdownConfigDialog.vue'
import CountdownDurationInput from '../components/CountdownDurationInput.vue'
import CountdownPreview from '../components/CountdownPreview.vue'
import CountdownProjectFab from '../components/CountdownProjectFab.vue'
import CountdownSavedList from '../components/CountdownSavedList.vue'
import { useCountdownFeature } from '../composables/useCountdown'

const { t } = useI18n()
const router = useRouter()

const {
  config,
  runtime,
  isProjecting,
  configOpen,
  isRunning,
  canStart,
  setTimeFormat,
  setBgColor,
  setTextColor,
  resetDisplayToDefault,
  openConfig,
  closeConfig,
  setDurationMs,
  setCountdownMode,
  setUntilTime,
  start,
  pause,
  reset,
  saveMark,
  removeSavedMark,
  clearSavedMarks,
  toggleProjection,
} = useCountdownFeature()

function goBack() {
  void router.push({ name: 'utilities-temporizador' })
}

function onToggleProjection() {
  void toggleProjection()
}

const stage = ref<StageSettings>(readEffectiveStageSettings('countdown'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('countdown')
  })
})
onUnmounted(() => unsubStage?.())

const stageBg = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))

// Características do módulo vindas do StageSettings (fonte única).
const effectiveConfig = computed(() => {
  const mod = stage.value.countdown
  return mod ? { ...config.value, ...mod } : { ...config.value }
})
</script>

<template>
  <section class="countdown-view">
    <header class="countdown-view__header">
      <PalcoRouteSelect module="countdown" />
      <button
        type="button"
        class="countdown-view__back"
        :aria-label="t('countdown.backToUtilities')"
        @click="goBack"
      >
        <i
          class="ti ti-arrow-left"
          aria-hidden="true"
        />
      </button>

      <div class="countdown-view__brand">
        <div class="countdown-view__brand-icon">
          <i
            class="ti ti-hourglass"
            aria-hidden="true"
          />
        </div>
        <h1 class="countdown-view__title">
          {{ t('countdown.title') }}
        </h1>
      </div>
    </header>

    <div class="countdown-view__content">
      <div class="countdown-view__stage">
        <GlassCard
          class="countdown-view__widget"
          :padding="false"
        >
          <div class="countdown-view__toolbar">
            <button
              type="button"
              class="countdown-view__tool-btn"
              :aria-label="t('countdown.config')"
              :title="t('countdown.config')"
              @click="openConfig"
            >
              <i
                class="ti ti-palette"
                aria-hidden="true"
              />
            </button>
          </div>

          <div
          class="countdown-view__preview"
          :style="stageBg"
        >
            <div class="countdown-view__duration">
              <CountdownDurationInput
                :duration-ms="runtime.durationMs"
                :mode="runtime.mode"
                :until-hour="runtime.untilHour"
                :until-minute="runtime.untilMinute"
                :disabled="isRunning"
                compact
                @update:duration-ms="setDurationMs"
                @update:mode="setCountdownMode"
                @update:until="setUntilTime"
              />
            </div>
            <CountdownPreview
              :config="effectiveConfig"
              :runtime="runtime"
              :stage="stage"
              preview
            />
          </div>

          <div class="countdown-view__controls">
            <button
              v-if="!isRunning"
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--start"
              :disabled="!canStart"
              @click="start"
            >
              <i
                class="ti ti-player-play"
                aria-hidden="true"
              />
              {{ t('countdown.start') }}
            </button>
            <button
              v-else
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--pause"
              @click="pause"
            >
              <i
                class="ti ti-player-pause"
                aria-hidden="true"
              />
              {{ t('countdown.pause') }}
            </button>

            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--reset"
              @click="reset"
            >
              <i
                class="ti ti-refresh"
                aria-hidden="true"
              />
              {{ t('countdown.reset') }}
            </button>

            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--save"
              @click="saveMark"
            >
              <i
                class="ti ti-device-floppy"
                aria-hidden="true"
              />
              {{ t('countdown.save') }}
            </button>
          </div>

          <div
            v-if="isProjecting"
            class="countdown-view__projecting"
          >
            <i
              class="ti ti-device-desktop"
              aria-hidden="true"
            />
            {{ t('countdown.projecting') }}
          </div>
        </GlassCard>
      </div>

      <CountdownSavedList
        :items="runtime.savedTimesMs"
        :time-format="config.timeFormat"
        @remove="removeSavedMark"
        @clear="clearSavedMarks"
      />
    </div>

    <StageCustomizationDialog
      :open="configOpen"
      scope="countdown"
      @close="closeConfig"
    />

    <CountdownProjectFab
      :projecting="isProjecting"
      @project="onToggleProjection"
      @clear="onToggleProjection"
    />
  </section>
</template>

<style scoped lang="scss">
.countdown-view {
  display: flex;
  box-sizing: border-box;
  min-height: 0;
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: 5rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.countdown-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.countdown-view__back {
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

.countdown-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.countdown-view__brand-icon {
  display: flex;
  width: 2.75rem;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.35rem;
  }
}

.countdown-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.countdown-view__content {
  display: flex;
  flex: 1;
  align-items: stretch;
  justify-content: center;
  gap: 1.25rem;
  min-height: 0;
}

.countdown-view__stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.countdown-view__widget {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 56rem;
  aspect-ratio: 21 / 9;
  max-height: min(100%, 28rem);
  overflow: hidden;
  flex-direction: column;
}

.countdown-view__toolbar {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
  display: flex;
  gap: 0.5rem;
}

.countdown-view__tool-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  .ti {
    font-size: 1.1rem;
  }
}

.countdown-view__duration {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  overflow: hidden;
  box-shadow: 0 6px 18px rgb(0 0 0 / 25%);
}

.countdown-view__preview {
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
  flex: 1;
  min-height: 8rem;
  padding: 0.75rem 1.5rem 0.5rem;
}

.countdown-view__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 0.75rem 1.25rem 1.25rem;
}

.countdown-view__ctrl {
  display: inline-flex;
  height: 2.35rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;

  .ti {
    font-size: 1.05rem;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--start {
    background: color-mix(in srgb, #43a047 22%, transparent);
    color: #66bb6a;
  }

  &--pause {
    background: color-mix(in srgb, #fb8c00 22%, transparent);
    color: #ffa726;
  }

  &--reset {
    background: color-mix(in srgb, #e53935 18%, transparent);
    color: #ef5350;
  }

  &--save {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.countdown-view__projecting {
  position: absolute;
  bottom: 4.25rem;
  left: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;
  transform: translateX(-50%);

  .ti {
    font-size: 0.95rem;
  }
}

@media (max-width: 900px) {
  .countdown-view__content {
    flex-direction: column;
    align-items: center;
  }
}

@media (max-width: 1280px) {
  .countdown-view {
    padding: 1rem;
    padding-bottom: 3.5rem;
  }

  .countdown-view__header {
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .countdown-view__brand-icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .countdown-view__title {
    font-size: 1.15rem;
  }

  .countdown-view__widget {
    min-height: 16rem;
    max-height: min(100%, 24rem);
  }

  .countdown-view__preview {
    padding: 0.65rem 1rem 0.5rem;
  }
}
</style>
