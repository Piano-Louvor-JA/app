<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { defaultAccent, type AccentKey } from '@design-system/themes'

import { useAppearanceSettings } from '../composables/useAppearanceSettings'

const { t } = useI18n()
const {
  accents,
  accentKey,
  customAccent,
  setAccentColor,
  setCustomAccent,
  resetAccent,
} = useAppearanceSettings()

const accentEntries = Object.entries(accents) as Array<
  [AccentKey, (typeof accents)[AccentKey]]
>

const colorInput = ref<HTMLInputElement | null>(null)

const isDefault = computed(
  () => !customAccent.value && accentKey.value === defaultAccent,
)

/** Valor inicial do seletor: a cor livre atual ou a do acento ativo. */
const pickerValue = computed(
  () => customAccent.value ?? accents[accentKey.value].primary,
)

function isPresetActive(key: AccentKey) {
  return !customAccent.value && accentKey.value === key
}

function selectAccent(key: AccentKey) {
  setAccentColor(key)
}

function openPicker() {
  colorInput.value?.click()
}

function onPickColor(event: Event) {
  setCustomAccent((event.target as HTMLInputElement).value)
}
</script>

<template>
  <GlassCard class="accent-color" :padding="false">
    <div class="accent-color__header">
      <i class="ti ti-palette accent-color__icon" aria-hidden="true" />
      <h3 class="accent-color__title">
        {{ t('settings.appearance.accentColor') }}
      </h3>
      <button
        v-if="!isDefault"
        type="button"
        class="accent-color__restore"
        :title="t('settings.appearance.accentRestore')"
        @click="resetAccent()"
      >
        <i class="ti ti-restore" aria-hidden="true" />
        <span>{{ t('settings.appearance.accentRestore') }}</span>
      </button>
    </div>

    <div
      class="accent-color__swatches"
      role="radiogroup"
      :aria-label="t('settings.appearance.accentColor')"
    >
      <div
        v-for="[key, accent] in accentEntries"
        :key="key"
        class="accent-color__slot"
      >
        <button
          type="button"
          class="accent-color__swatch"
          :class="{ 'accent-color__swatch--active': isPresetActive(key) }"
          :style="{ '--swatch': accent.primary }"
          role="radio"
          :aria-checked="isPresetActive(key)"
          :aria-label="accent.label"
          @click="selectAccent(key)"
        >
          <i
            v-if="isPresetActive(key)"
            class="ti ti-check accent-color__swatch-check"
            aria-hidden="true"
          />
        </button>
        <span
          v-if="key === defaultAccent"
          class="accent-color__caption"
        >
          {{ t('settings.appearance.accentDefault') }}
        </span>
      </div>

      <div class="accent-color__slot">
        <button
          type="button"
          class="accent-color__swatch accent-color__swatch--custom"
          :class="{
            'accent-color__swatch--active': Boolean(customAccent),
            'accent-color__swatch--empty': !customAccent,
          }"
          :style="customAccent ? { '--swatch': customAccent } : undefined"
          role="radio"
          :aria-checked="Boolean(customAccent)"
          :aria-label="t('settings.appearance.accentCustom')"
          :title="t('settings.appearance.accentCustom')"
          @click="openPicker"
        >
          <i
            class="ti accent-color__swatch-check"
            :class="customAccent ? 'ti-check' : 'ti-color-picker'"
            aria-hidden="true"
          />
        </button>
        <input
          ref="colorInput"
          type="color"
          class="accent-color__input"
          tabindex="-1"
          aria-hidden="true"
          :value="pickerValue"
          @input="onPickColor"
        >
      </div>
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.accent-color {
  padding: 20px;
  animation: appearance-float 6s ease-in-out infinite;
  animation-delay: 0.8s;

  @media (max-width: 1280px) {
      padding: 1rem;
    }
}

.accent-color__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.accent-color__icon {
  color: var(--ds-color-primary);
  font-size: 22px;
  line-height: 1;

  @media (max-width: 1280px) {
      font-size: 20px;
    }
}

.accent-color__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 20px;
}

.accent-color__restore {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
  padding: 0.25rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: var(--ds-radius-full);
  background: transparent;
  color: color-mix(in srgb, var(--ds-color-on-surface) 75%, transparent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--ds-motion-duration, 200ms) ease,
    border-color var(--ds-motion-duration, 200ms) ease;

  i {
    font-size: 14px;
  }

  &:hover {
    color: var(--ds-color-primary);
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
  }
}

.accent-color__slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.accent-color__caption {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--ds-color-on-surface) 55%, transparent);
}

.accent-color__input {
  position: absolute;
  top: 0;
  left: 50%;
  width: 2rem;
  height: 2rem;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
}

.accent-color__swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: start;
  gap: 0.65rem 0.55rem;
  justify-items: center;
}

.accent-color__swatch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--ds-radius-full);
  background: var(--swatch);
  cursor: pointer;
  transition:
    transform var(--ds-motion-duration, 200ms) var(--ds-motion-easing, ease),
    box-shadow var(--ds-motion-duration, 200ms) ease,
    border-color var(--ds-motion-duration, 200ms) ease;

  &:hover {
    transform: scale(1.1);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 3px;
  }

  &--active {
    transform: scale(1.12);
    border-color: #ffffff;
    box-shadow:
      0 0 0 3px color-mix(in srgb, #ffffff 88%, transparent),
      0 0 14px color-mix(in srgb, var(--swatch) 55%, transparent);
  }
}

.accent-color__swatch--empty {
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 40%, transparent);
  background: conic-gradient(
    from 0deg,
    #e57373,
    #ffb74d,
    #fff176,
    #81c784,
    #4fc3f7,
    #9575cd,
    #f06292,
    #e57373
  );
  opacity: 0.85;

  &:hover {
    opacity: 1;
  }
}

.accent-color__swatch-check {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
}

@keyframes appearance-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
</style>
