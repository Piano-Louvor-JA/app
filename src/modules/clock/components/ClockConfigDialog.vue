<script setup lang="ts">
import FontSelector from '@modules/settings/components/FontSelector.vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import {
  CLOCK_BG_PRESETS,
  CLOCK_TEXT_PRESETS,
  type ClockConfig,
  type ClockStyle,
} from '../types/clock'

defineProps<{
  open: boolean
  config: ClockConfig
}>()

const emit = defineEmits<{
  close: []
  'update:style': [value: ClockStyle]
  'update:showSeconds': [value: boolean]
  'update:format24h': [value: boolean]
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
    <Transition name="clock-config-fade">
      <div
        v-if="open"
        class="clock-config"
        role="dialog"
        aria-modal="true"
        :aria-label="t('clock.configTitle')"
      >
        <GlassCard
          class="clock-config__panel"
          elevated
          :padding="false"
        >
          <header class="clock-config__header">
            <div class="clock-config__heading">
              <div class="clock-config__heading-icon">
                <i
                  class="ti ti-palette"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 class="clock-config__title">
                  {{ t('clock.configTitle') }}
                </h2>
                <p class="clock-config__subtitle">
                  {{ t('clock.configSubtitle') }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="clock-config__icon-btn"
              :aria-label="t('clock.close')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="clock-config__body">
            <FontSelector scope="clock" compact />

            <section class="clock-config__section">
              <div class="clock-config__section-head">
                <i
                  class="ti ti-paint"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('clock.bgColor') }}</h3>
                  <p>{{ t('clock.bgColorHint') }}</p>
                </div>
              </div>
              <div
                class="clock-config__swatches"
                role="radiogroup"
                :aria-label="t('clock.bgColor')"
              >
                <button
                  v-for="color in CLOCK_BG_PRESETS"
                  :key="`bg-${color}`"
                  type="button"
                  class="clock-config__swatch"
                  :class="{ 'clock-config__swatch--active': config.bgColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.bgColor === color"
                  :aria-label="color"
                  @click="emit('update:bgColor', color)"
                />
                <label class="clock-config__custom">
                  <input
                    type="color"
                    :value="config.bgColor"
                    :aria-label="t('clock.customColor')"
                    @input="onBgInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>
            </section>

            <section class="clock-config__section">
              <div class="clock-config__section-head">
                <i
                  class="ti ti-typography"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('clock.textColor') }}</h3>
                  <p>{{ t('clock.textColorHint') }}</p>
                </div>
              </div>
              <div
                class="clock-config__swatches"
                role="radiogroup"
                :aria-label="t('clock.textColor')"
              >
                <button
                  v-for="color in CLOCK_TEXT_PRESETS"
                  :key="`text-${color}`"
                  type="button"
                  class="clock-config__swatch"
                  :class="{ 'clock-config__swatch--active': config.textColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.textColor === color"
                  :aria-label="color"
                  @click="emit('update:textColor', color)"
                />
                <label class="clock-config__custom">
                  <input
                    type="color"
                    :value="config.textColor"
                    :aria-label="t('clock.customColor')"
                    @input="onTextInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>

              <div class="clock-config__style">
                <span class="clock-config__style-label">
                  <i
                    class="ti ti-clock"
                    aria-hidden="true"
                  />
                  {{ t('clock.style') }}
                </span>
                <div
                  class="clock-config__toggle-group"
                  role="group"
                  :aria-label="t('clock.style')"
                >
                  <button
                    type="button"
                    class="clock-config__style-btn"
                    :class="{ 'clock-config__style-btn--active': config.style === 'digital' }"
                    @click="emit('update:style', 'digital')"
                  >
                    <i
                      class="ti ti-letter-case"
                      aria-hidden="true"
                    />
                    {{ t('clock.digital') }}
                  </button>
                  <button
                    type="button"
                    class="clock-config__style-btn"
                    :class="{ 'clock-config__style-btn--active': config.style === 'analog' }"
                    @click="emit('update:style', 'analog')"
                  >
                    <i
                      class="ti ti-clock"
                      aria-hidden="true"
                    />
                    {{ t('clock.analog') }}
                  </button>
                </div>
              </div>
            </section>

            <section class="clock-config__section">
              <div class="clock-config__section-head">
                <i
                  class="ti ti-adjustments"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('clock.options') }}</h3>
                  <p>{{ t('clock.optionsHint') }}</p>
                </div>
              </div>

              <div class="clock-config__option">
                <span>{{ t('clock.showSeconds') }}</span>
                <button
                  type="button"
                  class="clock-config__switch"
                  role="switch"
                  :aria-checked="config.showSeconds"
                  :aria-label="t('clock.showSeconds')"
                  @click="emit('update:showSeconds', !config.showSeconds)"
                >
                  <span
                    class="clock-config__switch-track"
                    :class="{ 'clock-config__switch-track--on': config.showSeconds }"
                    aria-hidden="true"
                  >
                    <span class="clock-config__switch-thumb" />
                  </span>
                </button>
              </div>

              <div
                class="clock-config__option"
                :class="{ 'clock-config__option--disabled': config.style === 'analog' }"
              >
                <span>{{ t('clock.format24h') }}</span>
                <button
                  type="button"
                  class="clock-config__switch"
                  role="switch"
                  :aria-checked="config.format24h"
                  :aria-label="t('clock.format24h')"
                  :disabled="config.style === 'analog'"
                  @click="emit('update:format24h', !config.format24h)"
                >
                  <span
                    class="clock-config__switch-track"
                    :class="{ 'clock-config__switch-track--on': config.format24h }"
                    aria-hidden="true"
                  >
                    <span class="clock-config__switch-thumb" />
                  </span>
                </button>
              </div>
            </section>
          </div>

          <footer class="clock-config__footer">
            <button
              type="button"
              class="clock-config__btn clock-config__btn--danger"
              @click="emit('reset')"
            >
              {{ t('clock.reset') }}
            </button>
            <button
              type="button"
              class="clock-config__btn clock-config__btn--primary"
              @click="emit('close')"
            >
              {{ t('clock.apply') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.clock-config {
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

.clock-config__panel {
  display: flex;
  width: min(100%, 32rem);
  max-height: min(90vh, 40rem);
  flex-direction: column;
  overflow: hidden;
}

.clock-config__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.clock-config__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.clock-config__heading-icon {
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

.clock-config__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.clock-config__subtitle {
  margin: 0.15rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1.3;
}

.clock-config__icon-btn {
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

.clock-config__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.clock-config__section {
  padding: 1rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.clock-config__section-head {
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

.clock-config__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.clock-config__swatch {
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

.clock-config__custom {
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

.clock-config__style {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.clock-config__style-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.65rem;
  color: var(--ds-color-on-surface);
  font-size: 0.875rem;
  font-weight: 700;

  .ti {
    color: var(--ds-color-primary);
    font-size: 1rem;
  }
}

.clock-config__toggle-group {
  display: flex;
  width: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
}

.clock-config__style-btn {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 2.5rem;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;

  &:last-child {
    border-right: 0;
  }

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }

  .ti {
    font-size: 1rem;
  }
}

.clock-config__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  color: var(--ds-color-on-surface);
  font-size: 0.875rem;
  font-weight: 500;

  &--disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  & + & {
    margin-top: 0.35rem;
  }
}

.clock-config__switch {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
  }
}

.clock-config__switch-track {
  position: relative;
  width: 2.75rem;
  height: 1.375rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  transition: background-color 200ms ease;

  &--on {
    background: var(--ds-color-primary);
  }
}

.clock-config__switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 9999px;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
  transition: transform 200ms ease;

  .clock-config__switch-track--on & {
    transform: translateX(1.375rem);
  }
}

.clock-config__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.clock-config__btn {
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

.clock-config-fade-enter-active,
.clock-config-fade-leave-active {
  transition: opacity 180ms ease;
}

.clock-config-fade-enter-from,
.clock-config-fade-leave-to {
  opacity: 0;
}
</style>
