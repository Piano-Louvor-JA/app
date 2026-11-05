<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsToggle from './SettingsToggle.vue'
import {
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_MIN,
  OVERLAY_SCALE_STEP,
  type OverlayStyle,
} from '../types/transmission'

const props = defineProps<{ modelValue: OverlayStyle; name: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [style: OverlayStyle] }>()
const { t } = useI18n()

const draft = ref<OverlayStyle>({ ...props.modelValue })
watch(() => props.modelValue, (value) => { draft.value = { ...value } })

function commit<K extends keyof OverlayStyle>(key: K, value: OverlayStyle[K]) {
  draft.value = { ...draft.value, [key]: value }
  emit('update:modelValue', { ...draft.value })
}

const groups = computed(() => [
  { key: 'layout' as const, label: t('settings.transmission.style.layout'), options: [
    { value: 'lower-third', label: t('settings.transmission.style.lowerThird') },
    { value: 'fullscreen', label: t('settings.transmission.style.fullscreen') },
  ] },
  { key: 'theme' as const, label: t('settings.transmission.style.theme'), options: [
    { value: 'dark', label: t('settings.transmission.style.dark') },
    { value: 'light', label: t('settings.transmission.style.light') },
    { value: 'transparent', label: t('settings.transmission.style.transparent') },
  ] },
  ...(draft.value.layout === 'lower-third' ? [{ key: 'position' as const, label: t('settings.transmission.style.position'), options: [
    { value: 'bottom', label: t('settings.transmission.style.bottom') },
    { value: 'top', label: t('settings.transmission.style.top') },
  ] }] : []),
])

const previewVars = computed(() => ({
  '--preview-scale': String(draft.value.textScale / 100),
  '--preview-accent': draft.value.accentColor,
}))
</script>

<template>
  <div class="transmission-style">
    <div class="transmission-style__controls">
      <div v-for="group in groups" :key="group.key" class="transmission-style__field">
        <span class="transmission-style__label">{{ group.label }}</span>
        <div class="transmission-style__segments" role="radiogroup" :aria-label="`${group.label} · ${name}`">
          <button v-for="option in group.options" :key="option.value" type="button" role="radio"
            class="transmission-style__segment" :data-test="`${group.key}-${option.value}`"
            :aria-checked="draft[group.key] === option.value" :disabled="disabled"
            @click="commit(group.key, option.value as never)">
            {{ option.label }}
          </button>
        </div>
      </div>
      <label class="transmission-style__field">
        <span class="transmission-style__label">{{ t('settings.transmission.style.textScale') }} · {{ draft.textScale }}%</span>
        <input type="range" data-test="text-scale" :min="OVERLAY_SCALE_MIN" :max="OVERLAY_SCALE_MAX" :step="OVERLAY_SCALE_STEP"
          :value="draft.textScale" :disabled="disabled"
          @input="draft = { ...draft, textScale: Number(($event.target as HTMLInputElement).value) }"
          @change="commit('textScale', Number(($event.target as HTMLInputElement).value))">
      </label>
      <div class="transmission-style__field transmission-style__field--inline">
        <span class="transmission-style__label">{{ t('settings.transmission.style.showHeading') }}</span>
        <SettingsToggle :model-value="draft.showHeading" :label="t('settings.transmission.style.showHeading')"
          @update:model-value="commit('showHeading', $event)" />
      </div>
      <label class="transmission-style__field transmission-style__field--inline">
        <span class="transmission-style__label">{{ t('settings.transmission.style.accent') }}</span>
        <input type="color" data-test="accent" class="transmission-style__color" :value="draft.accentColor" :disabled="disabled"
          @change="commit('accentColor', ($event.target as HTMLInputElement).value.toUpperCase())">
      </label>
    </div>

    <figure class="transmission-style__figure">
      <figcaption class="transmission-style__label">{{ t('settings.transmission.style.preview') }}</figcaption>
      <div class="transmission-style__preview" :style="previewVars"
        :data-layout="draft.layout" :data-theme="draft.theme" :data-position="draft.position">
        <div class="transmission-style__card">
          <p class="transmission-style__text">{{ t('settings.transmission.style.sampleText') }}</p>
          <p v-if="draft.showHeading" class="transmission-style__reference">{{ t('settings.transmission.style.sampleRef') }}</p>
        </div>
      </div>
    </figure>
  </div>
</template>

<style scoped lang="scss">
.transmission-style {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;

  &__controls { display: flex; flex-direction: column; gap: 0.75rem; }
  &__field { display: flex; flex-direction: column; gap: 0.35rem; }
  &__field--inline { flex-direction: row; align-items: center; justify-content: space-between; }
  &__label { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; font-weight: 600; }
  &__segments { display: inline-flex; flex-wrap: wrap; gap: 0.3rem; }

  &__segment {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 999px;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-size: 0.8rem;
    cursor: pointer;

    &[aria-checked='true'] {
      border-color: var(--ds-color-primary);
      background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
      color: var(--ds-color-primary);
    }

    &:disabled { opacity: 0.55; cursor: not-allowed; }
  }

  &__color { width: 2.5rem; height: 1.8rem; padding: 0; border: 1px solid var(--ds-color-outline); border-radius: 0.4rem; background: none; }
  &__figure { display: flex; flex-direction: column; gap: 0.35rem; margin: 0; }

  &__preview {
    --preview-base: 0.62rem;

    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    aspect-ratio: 16 / 9;
    padding: 6%;
    overflow: hidden;
    border-radius: 0.6rem;
    background:
      linear-gradient(135deg, rgb(255 255 255 / 0.06) 25%, transparent 25%) 0 0 / 1rem 1rem,
      linear-gradient(160deg, #3a4a5c, #1d2530);

    &[data-position='top'] { justify-content: flex-start; }

    &[data-layout='fullscreen'] {
      --preview-base: 0.95rem;

      justify-content: center;
      text-align: center;
    }

    &[data-layout='fullscreen'][data-theme='dark'] { background: #000; }
    &[data-layout='fullscreen'][data-theme='light'] { background: #f2f2f2; }
  }

  &__card {
    padding: 0.5rem 0.7rem;
    border-radius: 0.45rem;
    background: rgb(10 10 10 / 0.72);
    color: #fff;

    [data-theme='light'] & { background: #fff; color: #111; }
    [data-theme='transparent'] & { background: none; text-shadow: 0 1px 4px rgb(0 0 0 / 0.85); }
    [data-layout='fullscreen'] & { background: none; }
  }

  &__text { margin: 0; font-size: calc(var(--preview-base) * var(--preview-scale)); font-weight: 600; line-height: 1.3; }

  &__reference {
    margin: 0.3rem 0 0;
    color: var(--preview-accent);
    font-size: calc(var(--preview-base) * var(--preview-scale) * 0.7);

    [data-theme='light'] & { filter: brightness(0.7); }
  }
}

@media (max-width: 720px) {
  .transmission-style { grid-template-columns: 1fr; }
}
</style>
