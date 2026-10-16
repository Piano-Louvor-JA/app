<script setup lang="ts">
import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'

import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import TimerSavedList from '../components/TimerSavedList.vue'
import { useTimerFeature } from '../composables/useTimer'

const { t } = useI18n()
const router = useRouter()

const {
  config,
  runtime,
  isProjecting,
  configOpen,
  openConfig,
  closeConfig,
  reset,
  saveMark,
  removeSavedMark,
  clearSavedMarks,
} = useTimerFeature()

function goBack() {
  void router.push({ name: 'utilities-temporizador' })
}
</script>

<template>
  <section class="timer-view">
    <header class="timer-view__header">
      <PalcoRouteSelect module="timer" />
      <button
        type="button"
        class="timer-view__back"
        :aria-label="t('timer.backToUtilities')"
        @click="goBack"
      >
        <i
          class="ti ti-arrow-left"
          aria-hidden="true"
        />
      </button>

      <div class="timer-view__brand">
        <div class="timer-view__brand-icon">
          <i
            class="ti ti-clock"
            aria-hidden="true"
          />
        </div>
        <h1 class="timer-view__title">
          {{ t('timer.title') }}
        </h1>
      </div>
    </header>

    <div class="timer-view__content">
      <div class="timer-view__stage">
        <GlassCard class="timer-view__widget">
          <button
            type="button"
            class="timer-view__tool-btn"
            :aria-label="t('timer.config')"
            :title="t('timer.config')"
            @click="openConfig"
          >
            <i
              class="ti ti-palette"
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            class="timer-view__ctrl timer-view__ctrl--reset"
            @click="reset"
          >
            <i
              class="ti ti-refresh"
              aria-hidden="true"
            />
            {{ t('timer.reset') }}
          </button>

          <button
            type="button"
            class="timer-view__ctrl timer-view__ctrl--save"
            @click="saveMark"
          >
            <i
              class="ti ti-device-floppy"
              aria-hidden="true"
            />
            {{ t('timer.save') }}
          </button>

          <div
            v-if="isProjecting"
            class="timer-view__projecting"
          >
            <i
              class="ti ti-device-desktop"
              aria-hidden="true"
            />
            {{ t('timer.projecting') }}
          </div>
        </GlassCard>
      </div>

      <TimerSavedList
        :items="runtime.savedTimesMs"
        :time-format="config.timeFormat"
        @remove="removeSavedMark"
        @clear="clearSavedMarks"
      />
    </div>

    <StageCustomizationDialog
      :open="configOpen"
      scope="timer"
      @close="closeConfig"
    />

  </section>
</template>

<style scoped lang="scss">
.timer-view {
  display: flex;
  box-sizing: border-box;
  min-height: 0;
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: 5rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.timer-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.timer-view__back {
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

.timer-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.timer-view__brand-icon {
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

.timer-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.timer-view__content {
  display: flex;
  flex: 1;
  align-items: stretch;
  justify-content: center;
  gap: 1.25rem;
  min-height: 0;
}

.timer-view__stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.timer-view__widget {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  width: 100%;
  max-width: 56rem;
}

.timer-view__tool-btn {
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

.timer-view__ctrl {
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

  &--reset {
    background: color-mix(in srgb, #e53935 18%, transparent);
    color: #ef5350;
  }

  &--save {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.timer-view__projecting {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;

  .ti {
    font-size: 0.95rem;
  }
}

@media (max-width: 900px) {
  .timer-view__content {
    flex-direction: column;
    align-items: center;
  }
}

@media (max-width: 1280px) {
  .timer-view {
    padding: 1rem;
    padding-bottom: 3.5rem;
  }

  .timer-view__header {
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .timer-view__brand-icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .timer-view__title {
    font-size: 1.15rem;
  }
}
</style>
