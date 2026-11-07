<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

import { GlassCard } from '@design-system/index'
import { resolveBackgroundImage, stageBgCss } from '../../settings/types/stage-settings'


import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import CountdownDurationInput from '../components/CountdownDurationInput.vue'
import CountdownSavedList from '../components/CountdownSavedList.vue'
import { useCountdownFeature } from '../composables/useCountdown'
import { useCountdownStage } from '../composables/useCountdownStage'

const { t } = useI18n()

// Minimizar: o estado da tela já vive na store; o retrato guarda só rolagem e miniatura.
const { minimize, prepare } = useMinimizablePage({
  describe: () => ({ title: t('countdown.title'), icon: 'ti-hourglass', summary: '' }),
  capture: () => null,
  fallbackRoute: { name: 'utilities-temporizador' },
})
const router = useRouter()

const {
  config,
  runtime,
  isProjecting,
  configOpen,
  isRunning,
  openConfig,
  closeConfig,
  setDurationMs,
  reset,
  saveMark,
  removeSavedMark,
  clearSavedMarks,
  refreshProjectionState,
} = useCountdownFeature()

function goBack() {
  router.push({ name: 'utilities-temporizador' })
}


// Popup fechado pelo X da janela: o main avisa 'projection:popups-closed'
// e o estado de projeção é ressincronizado.
let unsubPopupsClosed: (() => void) | null = null
onMounted(() => {
  const bridge = (window as unknown as {
    louvorja?: { projection?: { onPopupsClosed?: (cb: () => void) => () => void } }
  }).louvorja
  unsubPopupsClosed =
    bridge?.projection?.onPopupsClosed?.(() => {
      refreshProjectionState()
    }) ?? null
})
onUnmounted(() => {
  unsubPopupsClosed?.()
  unsubPopupsClosed = null
})

const { stage } = useCountdownStage(config)

const stageBg = computed(() => ({
  backgroundColor: stageBgCss(stage.value.backgroundColor),
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))
</script>

<template>
  <section class="countdown-view">
    <header class="countdown-view__header">
      <PageBackStack @minimize="minimize" @prepare="prepare">
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
      </PageBackStack>

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
            <div class="countdown-view__tool-group countdown-view__tool-group--left">
                          <button
                            type="button"
                            class="countdown-view__tool-btn"
                            :aria-label="t('countdown.personalize')"
                            :title="t('countdown.personalize')"
                            @click="openConfig"
                          >
                            <i
                              class="ti ti-palette"
                              aria-hidden="true"
                            />
                          </button>
                          </div>
                        </div>


          <div
            class="countdown-view__preview"
            :style="stageBg"
          >
            <div class="countdown-view__duration">
                          <CountdownDurationInput
                            :duration-ms="runtime.durationMs"
                            :disabled="isRunning"
                            compact
                            @update:duration-ms="setDurationMs"
                          />
                        </div>
          </div>

          <div class="countdown-view__controls">
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
  </section>
</template>

<style scoped lang="scss">
.countdown-view {
  display: flex;
  min-height: calc(
    (100 * var(--ui-vh)) - var(--ds-header-height, 5.5rem) - var(--ds-dock-height, 5.5rem)
  );
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 5rem);
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
  border-radius: var(--ds-radius-md, 0.75rem);
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
  flex-direction: column;
}


.countdown-view__toolbar {
  position: absolute;
  inset: 1rem 1rem auto;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  pointer-events: none;
}

.countdown-view__tool-group {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  pointer-events: auto;

  &--right {
    justify-content: flex-end;
  }
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
  /* F1 (web#175): fluxo, não overlay — inputs nunca mais cobrem os dígitos */
  position: static;
  transform: none;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  overflow: visible;
  margin: 0.5rem auto 0;
  width: fit-content;
}

.countdown-view__preview {
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
  padding: 0.75rem 1.5rem 1rem;
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
  border-radius: var(--ds-radius-md, 0.5rem);
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
    background: rgba(67, 160, 71, 0.30);
    color: #a5d6a7;
  }

  &--pause {
    background: rgba(251, 140, 0, 0.30);
    color: #ffcc80;
  }

  &--reset {
    background: rgba(229, 57, 53, 0.25);
    color: #ef9a9a;
  }

  &--save {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.countdown-view__projecting {
  /* web#175: fluxo, não overlay — absolute aqui encostava no botão Pausar
     quando a altura do card varia (janela estreita / card de inputs no fluxo) */
  position: static;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0.35rem auto 0;

  .ti {
    font-size: 0.95rem;
  }
}

@media (max-width: 1280px) {
  .countdown-view {
    padding: 1rem;
    padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 3.5rem);
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

  .countdown-view__preview {
    padding: 0.65rem 1rem 0.5rem;
  }
}

@media (max-width: 960px) {
  .countdown-view__content {
    flex-direction: column;
    align-items: center;
  }
}
</style>
