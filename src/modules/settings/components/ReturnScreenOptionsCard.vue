<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { useProjectionSettings } from '../composables/useProjectionSettings'
import SettingsToggle from './SettingsToggle.vue'

const { t } = useI18n()
const {
  settings,
  monitorOptions,
  setOpenReturnScreen,
  selectReturnDisplay,
} = useProjectionSettings()
const returnMonitorMissing = computed(() => settings.value.openReturnScreen &&
  settings.value.returnDisplayId != null &&
  !monitorOptions.value.some(monitor => monitor.id === settings.value.returnDisplayId))
</script>

<template>
  <GlassCard class="return-screen">
    <div class="return-screen__header">
        <i class="ti ti-device-tv return-screen__icon" aria-hidden="true" />
      <h3 class="return-screen__title">
        {{ t('settings.projection.returnScreen.title') }}
      </h3>
    </div>

    <div class="return-screen__row">
      <button
        type="button"
        class="return-screen__label-btn"
        @click="setOpenReturnScreen(!settings.openReturnScreen)"
      >
        {{ t('settings.projection.returnScreen.enable') }}
      </button>
      <SettingsToggle
        :model-value="settings.openReturnScreen"
        :label="t('settings.projection.returnScreen.enable')"
        @update:model-value="setOpenReturnScreen($event)"
      />
    </div>

    <p v-if="returnMonitorMissing" class="return-screen__caption" role="status">
      {{ t('settings.projection.returnScreen.unavailable') }}
    </p>

    <p class="return-screen__caption">
      {{ t('settings.projection.returnScreen.selectMonitor') }}
    </p>

    <div
      v-if="monitorOptions.length > 0"
      class="return-screen__grid"
      role="radiogroup"
      :aria-label="t('settings.projection.returnScreen.selectMonitor')"
    >
      <button
        v-for="monitor in monitorOptions"
        :key="monitor.id"
        type="button"
        class="return-screen__option"
        :class="{
          'return-screen__option--active': settings.returnDisplayId === monitor.id,
        }"
        role="radio"
        :aria-checked="settings.returnDisplayId === monitor.id"
        @click="selectReturnDisplay(monitor.id)"
      >
        <i
          class="ti return-screen__option-icon"
          :class="
            settings.returnDisplayId === monitor.id
              ? 'ti-screen-share'
              : 'ti-device-desktop'
          "
          aria-hidden="true"
        />
        <span class="return-screen__option-label">{{ monitor.label }}</span>
        <span class="return-screen__option-meta">
          {{
            monitor.isPrimary
              ? t('settings.projection.monitors.primary')
              : t('settings.projection.monitors.extended')
          }}
        </span>
      </button>
    </div>

    <p
      v-else
      class="return-screen__empty"
      role="status"
    >
      {{ t('settings.projection.returnScreen.empty') }}
    </p>
  </GlassCard>
</template>

<style scoped lang="scss">
.return-screen {
  display: flex;
  flex-direction: column;
  padding: 2rem;
}

.return-screen__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.return-screen__icon {
  color: var(--ds-color-primary);
  font-size: 24px;
  line-height: 1;
}

.return-screen__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.return-screen__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.return-screen__label-btn {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  text-align: left;
  cursor: pointer;
  transition: color 150ms ease;

  &:hover {
    color: var(--ds-color-on-surface);
  }
}

.return-screen__caption {
  margin: 0 0 1rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
  opacity: 0.7;
}

.return-screen__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.return-screen__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 1rem;
  border: 2px solid transparent;
  border-radius: var(--ds-radius-lg);
  background: color-mix(in srgb, var(--ds-color-on-surface) 3%, transparent);
  box-shadow: inset 0 0 0 1px var(--ds-color-outline);
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease,
    transform 150ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  }

  &:active {
    transform: scale(0.98);
  }

  &--active {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    box-shadow: none;
    color: var(--ds-color-primary);
  }
}

.return-screen__option-icon {
  font-size: 32px;
  line-height: 1;
}

.return-screen__option-label {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}

.return-screen__option-meta {
  font-size: 10px;
  opacity: 0.8;
}

.return-screen__empty {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--ds-radius-md);
  background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  color: var(--ds-color-on-surface-variant);
  font-size: 13px;
  line-height: 1.4;
}
</style>
