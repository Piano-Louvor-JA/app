<script setup lang="ts">
import PalcoRouteSelect from '../../settings/components/PalcoRouteSelect.vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'

import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import { useClockFeature } from '../composables/useClock'

const { t } = useI18n()
const router = useRouter()

const { isProjecting, configOpen, openConfig, closeConfig } = useClockFeature()

function goBack() {
  void router.push({ name: 'utilities-temporizador' })
}
</script>

<template>
  <section class="clock-view">
    <header class="clock-view__header">
      <PalcoRouteSelect module="clock" />
      <button
        type="button"
        class="clock-view__back"
        :aria-label="t('clock.backToUtilities')"
        @click="goBack"
      >
        <i
          class="ti ti-arrow-left"
          aria-hidden="true"
        />
      </button>

      <div class="clock-view__brand">
        <div class="clock-view__brand-icon">
          <i
            class="ti ti-clock"
            aria-hidden="true"
          />
        </div>
        <h1 class="clock-view__title">
          {{ t('clock.title') }}
        </h1>
      </div>
    </header>

    <div class="clock-view__stage">
      <GlassCard class="clock-view__widget">
        <button
          type="button"
          class="clock-view__tool-btn"
          :aria-label="t('clock.config')"
          :title="t('clock.config')"
          @click="openConfig"
        >
          <i
            class="ti ti-palette"
            aria-hidden="true"
          />
          {{ t('clock.config') }}
        </button>

        <div
          v-if="isProjecting"
          class="clock-view__projecting"
        >
          <i
            class="ti ti-device-desktop"
            aria-hidden="true"
          />
          {{ t('clock.projecting') }}
        </div>
      </GlassCard>
    </div>

    <StageCustomizationDialog
      :open="configOpen"
      scope="clock"
      @close="closeConfig"
    />
  </section>
</template>

<style scoped lang="scss">
.clock-view {
  display: flex;
  box-sizing: border-box;
  min-height: 0;
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: 5rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.clock-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.clock-view__back {
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

.clock-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.clock-view__brand-icon {
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

.clock-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.clock-view__stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.clock-view__widget {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 56rem;
}

.clock-view__tool-btn {
  display: inline-flex;
  height: 2.35rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;
  transition: background-color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  .ti {
    font-size: 1.05rem;
  }
}

.clock-view__projecting {
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

@media (max-width: 1280px) {
  .clock-view {
    padding: 1rem;
    padding-bottom: 3.5rem;
  }

  .clock-view__header {
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .clock-view__brand-icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .clock-view__title {
    font-size: 1.15rem;
  }
}
</style>
