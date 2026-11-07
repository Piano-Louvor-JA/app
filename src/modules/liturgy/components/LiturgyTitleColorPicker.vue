<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { NOTES_TEXT_COLORS } from '../services/rich-notes'

const props = defineProps<{
  /** Cor escolhida (hex); vazio = cor padrão da projeção. */
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [color: string]
}>()

const { t } = useI18n()
const open = ref(false)
const rootEl = ref<HTMLDivElement | null>(null)

function choose(color: string) {
  emit('update:modelValue', color)
  open.value = false
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!rootEl.value?.contains(event.target as Node)) open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    event.stopPropagation()
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMouseDown))
</script>

<template>
  <div
    ref="rootEl"
    class="title-color"
    @keydown="onKeydown"
  >
    <button
      type="button"
      class="title-color__trigger"
      :title="t('liturgy.dialog.titleColor')"
      :aria-label="t('liturgy.dialog.titleColor')"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="title-color-trigger"
      @click="open = !open"
    >
      <i
        class="ti ti-palette"
        aria-hidden="true"
      />
      <span
        class="title-color__current"
        :class="{ 'title-color__current--default': !props.modelValue }"
        :style="props.modelValue ? { background: props.modelValue } : undefined"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="open"
      class="title-color__popover"
      role="menu"
      :aria-label="t('liturgy.dialog.titleColor')"
    >
      <button
        type="button"
        role="menuitemradio"
        class="title-color__default"
        :aria-checked="!props.modelValue"
        data-color=""
        @click="choose('')"
      >
        <i
          class="ti ti-rotate"
          aria-hidden="true"
        />
        {{ t('liturgy.dialog.titleColorDefault') }}
      </button>
      <div class="title-color__swatches">
        <button
          v-for="color in NOTES_TEXT_COLORS"
          :key="color"
          type="button"
          role="menuitemradio"
          class="title-color__swatch"
          :class="{ 'title-color__swatch--active': props.modelValue === color }"
          :style="{ background: color }"
          :aria-checked="props.modelValue === color"
          :aria-label="`${t('liturgy.dialog.titleColor')} ${color}`"
          :data-color="color"
          @click="choose(color)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.title-color {
  position: relative;
  flex: none;
}

.title-color__trigger {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  width: 2.75rem;
  height: 100%;
  min-height: 2.6rem;
  border: 1px solid color-mix(in srgb, #fff 10%, transparent);
  border-radius: 0.65rem 0 0.65rem 0;
  background: var(--ds-color-surface-container-low, #1c1b1b);
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font-size: 1rem;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, #fff 8%, transparent);
  }
}

.title-color__current {
  width: 1.2rem;
  height: 0.25rem;
  border-radius: 999px;

  &--default {
    background: #fb8c00;
    opacity: 0.55;
  }
}

.title-color__popover {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.45rem;
  border: 1px solid color-mix(in srgb, #fff 12%, transparent);
  border-radius: 0.55rem;
  background: var(--ds-color-surface-container-high, #2a2a2a);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.title-color__default {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.45rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;

  &:hover,
  &[aria-checked='true'] {
    background: color-mix(in srgb, #fff 8%, transparent);
  }
}

.title-color__swatches {
  display: grid;
  grid-template-columns: repeat(6, 1.5rem);
  gap: 0.3rem;
}

.title-color__swatch {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid color-mix(in srgb, #fff 25%, transparent);
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    transform: scale(1.12);
  }

  &--active {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}
</style>
