<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useOnboarding } from '../composables/useOnboarding'

/**
 * Lembrete leve da Home (SPEC telemetria-dispositivos §4): sem modal, só
 * enquanto faltar distrito ou igreja. Os campos logo acima já são editáveis.
 */
const { t } = useI18n()
const { showHomeReminder, snoozeReminder, dismissReminder } = useOnboarding()
</script>

<template>
  <Transition name="home-reminder">
    <div
      v-if="showHomeReminder"
      class="home-reminder"
      role="note"
      data-test="home-location-reminder"
    >
      <i class="ti ti-map-pin home-reminder__icon" aria-hidden="true" />
      <p class="home-reminder__text">
        {{ t('onboarding.reminder.text') }}
      </p>
      <div class="home-reminder__actions">
        <button
          type="button"
          class="home-reminder__btn"
          data-test="home-reminder-snooze"
          @click="snoozeReminder"
        >
          {{ t('onboarding.reminder.later') }}
        </button>
        <button
          type="button"
          class="home-reminder__btn home-reminder__btn--muted"
          data-test="home-reminder-dismiss"
          @click="dismissReminder"
        >
          {{ t('onboarding.reminder.never') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.home-reminder {
  display: flex;
  max-width: 34rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
  margin-top: 1.5rem;
  padding: 10px 16px;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  border-radius: var(--ds-radius-lg, 16px);
  background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
  color: var(--ds-color-on-surface);
}

.home-reminder__icon {
  color: var(--ds-color-primary);
  font-size: 18px;
}

.home-reminder__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.home-reminder__actions {
  display: flex;
  gap: 4px;
}

.home-reminder__btn {
  padding: 4px 10px;
  border: none;
  border-radius: var(--ds-radius-full, 999px);
  background: transparent;
  color: var(--ds-color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  }
}

.home-reminder__btn--muted {
  color: var(--ds-color-on-surface-variant);
}

.home-reminder-enter-active,
.home-reminder-leave-active {
  transition:
    opacity var(--ds-motion-duration, 200ms) ease,
    transform var(--ds-motion-duration, 200ms) ease;
}

.home-reminder-enter-from,
.home-reminder-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
