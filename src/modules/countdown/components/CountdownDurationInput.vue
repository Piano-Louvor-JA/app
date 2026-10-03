<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  clampDurationPart,
  durationMsFromParts,
  durationPartsFromMs,
} from '../services/countdown-format'

const props = defineProps<{
  durationMs: number
  disabled?: boolean
  /** Modo compacto: só os campos HH:MM:SS inline, sem cabeçalho (usado no card do grupo de tempo). */
  compact?: boolean
  /** Esconde o campo de segundos (ex.: agendamento Escola Sabatina HH:MM). */
  noSeconds?: boolean
}>()

const emit = defineEmits<{
  'update:durationMs': [value: number]
}>()

const { t } = useI18n()

const parts = computed(() => durationPartsFromMs(props.durationMs))

function commit(next: { hours?: number; minutes?: number; seconds?: number }) {
  const ms = durationMsFromParts({
    hours: next.hours ?? parts.value.hours,
    minutes: next.minutes ?? parts.value.minutes,
    seconds: next.seconds ?? parts.value.seconds,
  })
  emit('update:durationMs', ms)
}

function onHours(event: Event) {
  const target = event.target as HTMLInputElement
  commit({ hours: clampDurationPart(target.value) })
}

function onMinutes(event: Event) {
  const target = event.target as HTMLInputElement
  commit({ minutes: clampDurationPart(target.value, 59) })
}

function onSeconds(event: Event) {
  const target = event.target as HTMLInputElement
  commit({ seconds: clampDurationPart(target.value, 59) })
}
</script>

<template>
  <div
    class="countdown-duration"
    :class="{
      'countdown-duration--disabled': disabled,
      'countdown-duration--compact': compact,
    }"
  >
    <div
      v-if="!compact"
      class="countdown-duration__head"
    >
      <i
        class="ti ti-hourglass"
        aria-hidden="true"
      />
      <div>
        <h3>{{ t('countdown.duration') }}</h3>
        <p>{{ t('countdown.durationHint') }}</p>
      </div>
    </div>

    <div
      class="countdown-duration__fields"
      role="group"
      :aria-label="t('countdown.duration')"
    >
      <label class="countdown-duration__field">
        <span>{{ t('countdown.hours') }}</span>
        <input
          type="number"
          min="0"
          max="99"
          inputmode="numeric"
          :value="parts.hours"
          :disabled="disabled"
          :aria-label="t('countdown.hours')"
          @change="onHours"
        >
      </label>
      <span
        class="countdown-duration__sep"
        aria-hidden="true"
      >:</span>
      <label class="countdown-duration__field">
        <span>{{ t('countdown.minutes') }}</span>
        <input
          type="number"
          min="0"
          max="59"
          inputmode="numeric"
          :value="parts.minutes"
          :disabled="disabled"
          :aria-label="t('countdown.minutes')"
          @change="onMinutes"
        >
      </label>
      <template v-if="!noSeconds">
        <span
          class="countdown-duration__sep"
          aria-hidden="true"
        >:</span>
        <label class="countdown-duration__field">
          <span>{{ t('countdown.seconds') }}</span>
          <input
            type="number"
            min="0"
            max="59"
            inputmode="numeric"
            :value="parts.seconds"
            :disabled="disabled"
            :aria-label="t('countdown.seconds')"
            @change="onSeconds"
          >
        </label>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.countdown-duration {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);

  &--disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  /* Modo compacto: faixa inline dentro do card do grupo de tempo */
  &--compact {
    gap: 0;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
    backdrop-filter: blur(4px);

    .countdown-duration__fields {
      gap: 0.3rem;
    }

    .countdown-duration__field {
      min-width: 3.25rem;
      gap: 0.15rem;

      span {
        font-size: 0.6rem;
      }

      input {
        height: 2rem;
        font-size: 0.9rem;
      }
    }

    .countdown-duration__sep {
      padding-bottom: 0.35rem;
      font-size: 1rem;
    }
  }
}

.countdown-duration__head {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;

  > .ti {
    margin-top: 0.1rem;
    color: var(--ds-color-primary);
    font-size: 1.25rem;
  }

  h3 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    margin: 0.1rem 0 0;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.72rem;
    line-height: 1.3;
  }
}

.countdown-duration__fields {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.35rem;
}

.countdown-duration__field {
  display: flex;
  min-width: 4.25rem;
  flex-direction: column;
  gap: 0.3rem;

  span {
    color: var(--ds-color-on-surface-variant);
    font-size: 0.7rem;
    font-weight: 600;
    text-align: center;
  }

  input {
    width: 100%;
    height: 2.5rem;
    border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
    border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
    background: color-mix(in srgb, var(--ds-color-surface, #111) 70%, transparent);
    color: var(--ds-color-on-surface);
    font-family: ui-monospace, monospace;
    font-size: 1.05rem;
    font-weight: 700;
    text-align: center;
    outline: none;

    &:focus {
      border-color: var(--ds-color-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
    }

    /* Chrome number spinners */
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      margin: 0;
    }
  }
}

.countdown-duration__sep {
  padding-bottom: 0.55rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 1.25rem;
  font-weight: 700;
}
</style>
