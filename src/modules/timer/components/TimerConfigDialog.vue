<script setup lang="ts">
import FontSelector from '@modules/settings/components/FontSelector.vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import {
  TIMER_BG_PRESETS,
  TIMER_TEXT_PRESETS,
  TIMER_TIME_FORMATS,
  type TimerDisplayConfig,
  type TimerTimeFormat,
} from '../types/timer'

defineProps<{
  open: boolean
  config: TimerDisplayConfig
}>()

const emit = defineEmits<{
  close: []
  'update:timeFormat': [value: TimerTimeFormat]
  'update:bgColor': [value: string]
  'update:textColor': [value: string]
  reset: []
}>()

const { t } = useI18n()

function onBgInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:bgColor', target.value)
}

function onTextInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:textColor', target.value)
}

</script>

<template>
  <Teleport to="body">
    <Transition name="timer-config-fade">
      <div
        v-if="open"
        class="timer-config"
        role="dialog"
        aria-modal="true"
        :aria-label="t('timer.configTitle')"
      >
        <GlassCard
          class="timer-config__panel"
          elevated
          :padding="false"
        >
          <header class="timer-config__header">
            <div class="timer-config__heading">
              <div class="timer-config__heading-icon">
                <i
                  class="ti ti-palette"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 class="timer-config__title">
                  {{ t('timer.configTitle') }}
                </h2>
                <p class="timer-config__subtitle">
                  {{ t('timer.configSubtitle') }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="timer-config__icon-btn"
              :aria-label="t('timer.close')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="timer-config__body">
            <FontSelector scope="timer" compact />

            <section class="timer-config__section">
              <div class="timer-config__section-head">
                <i
                  class="ti ti-paint"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('timer.bgColor') }}</h3>
                  <p>{{ t('timer.bgColorHint') }}</p>
                </div>
              </div>
              <div
                class="timer-config__swatches"
                role="radiogroup"
                :aria-label="t('timer.bgColor')"
              >
                <button
                  v-for="color in TIMER_BG_PRESETS"
                  :key="`bg-${color}`"
                  type="button"
                  class="timer-config__swatch"
                  :class="{ 'timer-config__swatch--active': config.bgColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.bgColor === color"
                  :aria-label="color"
                  @click="emit('update:bgColor', color)"
                />
                <label class="timer-config__custom">
                  <input
                    type="color"
                    :value="config.bgColor"
                    :aria-label="t('timer.customColor')"
                    @input="onBgInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>
            </section>

            <section class="timer-config__section">
              <div class="timer-config__section-head">
                <i
                  class="ti ti-typography"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('timer.textColor') }}</h3>
                  <p>{{ t('timer.textColorHint') }}</p>
                </div>
              </div>
              <div
                class="timer-config__swatches"
                role="radiogroup"
                :aria-label="t('timer.textColor')"
              >
                <button
                  v-for="color in TIMER_TEXT_PRESETS"
                  :key="`text-${color}`"
                  type="button"
                  class="timer-config__swatch"
                  :class="{ 'timer-config__swatch--active': config.textColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.textColor === color"
                  :aria-label="color"
                  @click="emit('update:textColor', color)"
                />
                <label class="timer-config__custom">
                  <input
                    type="color"
                    :value="config.textColor"
                    :aria-label="t('timer.customColor')"
                    @input="onTextInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>
            </section>

            <section class="timer-config__section">
              <div class="timer-config__section-head">
                <i
                  class="ti ti-clock"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('timer.timeFormat') }}</h3>
                  <p>{{ t('timer.timeFormatHint') }}</p>
                </div>
              </div>
              <div
                class="timer-config__formats"
                role="radiogroup"
                :aria-label="t('timer.timeFormat')"
              >
                <button
                  v-for="format in TIMER_TIME_FORMATS"
                  :key="format"
                  type="button"
                  class="timer-config__format-btn"
                  :class="{ 'timer-config__format-btn--active': config.timeFormat === format }"
                  role="radio"
                  :aria-checked="config.timeFormat === format"
                  @click="emit('update:timeFormat', format)"
                >
                  {{ format }}
                </button>
              </div>
            </section>
          </div>

          <footer class="timer-config__footer">
            <button
              type="button"
              class="timer-config__btn timer-config__btn--danger"
              @click="emit('reset')"
            >
              {{ t('timer.resetDisplay') }}
            </button>
            <button
              type="button"
              class="timer-config__btn timer-config__btn--primary"
              @click="emit('close')"
            >
              {{ t('timer.apply') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.timer-config {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(2px);
}

.timer-config__panel {
  display: flex;
  width: min(100%, 32rem);
  max-height: min(90vh, 40rem);
  flex-direction: column;
  overflow: hidden;
}

.timer-config__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.timer-config__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.timer-config__heading-icon {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.25rem;
  }
}

.timer-config__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.timer-config__subtitle {
  margin: 0.15rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1.3;
}

.timer-config__icon-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
    color: var(--ds-color-on-surface);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.timer-config__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.timer-config__section {
  padding: 1rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.timer-config__section-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;

  > .ti {
    margin-top: 0.15rem;
    color: var(--ds-color-primary);
    font-size: 1.35rem;
  }

  h3 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    margin: 0.15rem 0 0;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.75rem;
    line-height: 1.3;
  }
}

.timer-config__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.timer-config__swatch {
  width: 2.25rem;
  height: 2.25rem;
  border: 2px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 9999px;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &--active {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
    transform: scale(1.12);
  }

  &:hover {
    transform: scale(1.08);
  }
}

.timer-config__custom {
  position: relative;
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  border-radius: 9999px;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .ti {
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.timer-config__formats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.timer-config__format-btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  font-weight: 700;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.timer-config__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.timer-config__btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 16%, transparent);
    color: var(--ds-color-error, #ffb4ab);
  }

  &--primary {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }
}

.timer-config-fade-enter-active,
.timer-config-fade-leave-active {
  transition: opacity 180ms ease;
}

.timer-config-fade-enter-from,
.timer-config-fade-leave-to {
  opacity: 0;
}
</style>
