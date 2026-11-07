<script setup lang="ts">
import FontSelector from '@modules/settings/components/FontSelector.vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import {
  RANDOM_ANIMATION_SPEEDS,
  RANDOM_BG_PRESETS,
  RANDOM_FONT_SIZE_MAX,
  RANDOM_FONT_SIZE_MIN,
  RANDOM_TEXT_PRESETS,
  RANDOM_TEXT_TRANSFORMS,
  type RandomAnimationSpeed,
  type RandomDisplayConfig,
  type RandomTextTransform,
} from '../types/random'

defineProps<{
  open: boolean
  config: RandomDisplayConfig
}>()

const emit = defineEmits<{
  close: []
  'update:bgColor': [value: string]
  'update:textColor': [value: string]
  'update:fontSizePc': [value: number]
  'update:textTransform': [value: RandomTextTransform]
  'update:animationSpeed': [value: RandomAnimationSpeed]
  reset: []
}>()

const { t } = useI18n()

const transformLabels: Record<RandomTextTransform, string> = {
  none: 'random.transformNone',
  uppercase: 'random.transformUpper',
  lowercase: 'random.transformLower',
}

const speedLabels: Record<RandomAnimationSpeed, string> = {
  fast: 'random.speedFast',
  normal: 'random.speedNormal',
  slow: 'random.speedSlow',
}

const speedIcons: Record<RandomAnimationSpeed, string> = {
  fast: 'ti-run',
  normal: 'ti-run',
  slow: 'ti-walk',
}

function onBgInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:bgColor', target.value)
}

function onTextInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:textColor', target.value)
}

function onFontInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:fontSizePc', Number(target.value))
}

function bumpFont(delta: number, current: number) {
  emit('update:fontSizePc', current + delta)
}

</script>

<template>
  <Teleport to="body">
    <Transition name="random-config-fade">
      <div
        v-if="open"
        class="random-config"
        role="dialog"
        aria-modal="true"
        :aria-label="t('random.configTitle')"
      >
        <GlassCard
          class="random-config__panel"
          elevated
          :padding="false"
        >
          <header class="random-config__header">
            <div class="random-config__heading">
              <div class="random-config__heading-icon">
                <i
                  class="ti ti-palette"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 class="random-config__title">
                  {{ t('random.configTitle') }}
                </h2>
                <p class="random-config__subtitle">
                  {{ t('random.configSubtitle') }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="random-config__icon-btn"
              :aria-label="t('random.close')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="random-config__body">
            <FontSelector scope="random" compact />

            <section class="random-config__section">
              <div class="random-config__section-head">
                <i
                  class="ti ti-paint"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('random.bgColor') }}</h3>
                  <p>{{ t('random.bgColorHint') }}</p>
                </div>
              </div>
              <div
                class="random-config__swatches"
                role="radiogroup"
                :aria-label="t('random.bgColor')"
              >
                <button
                  v-for="color in RANDOM_BG_PRESETS"
                  :key="`bg-${color}`"
                  type="button"
                  class="random-config__swatch"
                  :class="{ 'random-config__swatch--active': config.bgColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.bgColor === color"
                  :aria-label="color"
                  @click="emit('update:bgColor', color)"
                />
                <label class="random-config__custom">
                  <input
                    type="color"
                    :value="config.bgColor"
                    :aria-label="t('random.customColor')"
                    @input="onBgInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>
            </section>

            <section class="random-config__section">
              <div class="random-config__section-head">
                <i
                  class="ti ti-text-size"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('random.textMain') }}</h3>
                  <p>{{ t('random.textMainHint') }}</p>
                </div>
              </div>

              <div
                class="random-config__swatches"
                role="radiogroup"
                :aria-label="t('random.textColor')"
              >
                <button
                  v-for="color in RANDOM_TEXT_PRESETS"
                  :key="`text-${color}`"
                  type="button"
                  class="random-config__swatch"
                  :class="{ 'random-config__swatch--active': config.textColor === color }"
                  :style="{ background: color }"
                  role="radio"
                  :aria-checked="config.textColor === color"
                  :aria-label="color"
                  @click="emit('update:textColor', color)"
                />
                <label class="random-config__custom">
                  <input
                    type="color"
                    :value="config.textColor"
                    :aria-label="t('random.customColor')"
                    @input="onTextInput"
                  >
                  <i
                    class="ti ti-color-picker"
                    aria-hidden="true"
                  />
                </label>
              </div>

              <div class="random-config__font">
                <div class="random-config__font-head">
                  <span>{{ t('random.fontSize') }}</span>
                  <span class="random-config__font-value">{{ config.fontSizePc }}</span>
                </div>
                <div class="random-config__font-controls">
                  <button
                    type="button"
                    class="random-config__icon-btn random-config__icon-btn--tonal"
                    :aria-label="t('random.decreaseFont')"
                    @click="bumpFont(-1, config.fontSizePc)"
                  >
                    <i
                      class="ti ti-minus"
                      aria-hidden="true"
                    />
                  </button>
                  <input
                    class="random-config__slider"
                    type="range"
                    :min="RANDOM_FONT_SIZE_MIN"
                    :max="RANDOM_FONT_SIZE_MAX"
                    :value="config.fontSizePc"
                    :aria-label="t('random.fontSize')"
                    @input="onFontInput"
                  >
                  <button
                    type="button"
                    class="random-config__icon-btn random-config__icon-btn--tonal"
                    :aria-label="t('random.increaseFont')"
                    @click="bumpFont(1, config.fontSizePc)"
                  >
                    <i
                      class="ti ti-plus"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <div
                class="random-config__toggles"
                role="radiogroup"
                :aria-label="t('random.textTransform')"
              >
                <button
                  v-for="value in RANDOM_TEXT_TRANSFORMS"
                  :key="value"
                  type="button"
                  class="random-config__toggle"
                  :class="{ 'random-config__toggle--active': config.textTransform === value }"
                  role="radio"
                  :aria-checked="config.textTransform === value"
                  @click="emit('update:textTransform', value)"
                >
                  {{ t(transformLabels[value]) }}
                </button>
              </div>
            </section>

            <section class="random-config__section">
              <div class="random-config__section-head">
                <i
                  class="ti ti-keyframes"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('random.animation') }}</h3>
                  <p>{{ t('random.animationHint') }}</p>
                </div>
              </div>
              <div
                class="random-config__toggles"
                role="radiogroup"
                :aria-label="t('random.animation')"
              >
                <button
                  v-for="speed in RANDOM_ANIMATION_SPEEDS"
                  :key="speed"
                  type="button"
                  class="random-config__toggle"
                  :class="{ 'random-config__toggle--active': config.animationSpeed === speed }"
                  role="radio"
                  :aria-checked="config.animationSpeed === speed"
                  @click="emit('update:animationSpeed', speed)"
                >
                  <i
                    class="ti"
                    :class="speedIcons[speed]"
                    aria-hidden="true"
                  />
                  {{ t(speedLabels[speed]) }}
                </button>
              </div>
            </section>
          </div>

          <footer class="random-config__footer">
            <button
              type="button"
              class="random-config__btn random-config__btn--danger"
              @click="emit('reset')"
            >
              {{ t('random.resetDisplay') }}
            </button>
            <button
              type="button"
              class="random-config__btn random-config__btn--primary"
              @click="emit('close')"
            >
              {{ t('random.apply') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.random-config {
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

.random-config__panel {
  display: flex;
  width: min(100%, 32rem);
  max-height: min(90vh, 42rem);
  flex-direction: column;
  overflow: hidden;
}

.random-config__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.random-config__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.random-config__heading-icon {
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

.random-config__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.random-config__subtitle {
  margin: 0.15rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1.3;
}

.random-config__icon-btn {
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

  &--tonal {
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    color: var(--ds-color-primary);
  }

  .ti {
    font-size: 1.15rem;
  }
}

.random-config__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.random-config__section {
  padding: 1rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.random-config__section-head {
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

.random-config__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.random-config__swatch {
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

.random-config__custom {
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

.random-config__font {
  margin-top: 1.25rem;
}

.random-config__font-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  color: var(--ds-color-on-surface);
  font-size: 0.875rem;
  font-weight: 700;
}

.random-config__font-value {
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
}

.random-config__font-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.random-config__slider {
  flex: 1;
  accent-color: var(--ds-color-primary);
}

.random-config__toggles {
  display: grid;
  margin-top: 1rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.random-config__toggle {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 700;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }

  .ti {
    font-size: 1rem;
  }
}

.random-config__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.random-config__btn {
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

.random-config-fade-enter-active,
.random-config-fade-leave-active {
  transition: opacity 180ms ease;
}

.random-config-fade-enter-from,
.random-config-fade-leave-to {
  opacity: 0;
}
</style>
