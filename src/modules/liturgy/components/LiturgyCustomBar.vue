<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { CustomLiturgy } from '../types/liturgy'

defineProps<{
  liturgies: CustomLiturgy[]
  selectedIndex: number
}>()

const emit = defineEmits<{
  select: [index: number]
  remove: [index: number]
  create: []
}>()

const { t } = useI18n()

</script>

<template>
  <div
    class="liturgy-custom-bar"
  >
    <p
      v-if="liturgies.length === 0"
      class="liturgy-custom-bar__empty"
    >
      {{ t('liturgy.custom.empty') }}
    </p>

    <button
      v-for="(liturgy, index) in liturgies"
      :key="liturgy.id"
      type="button"
      class="liturgy-custom-bar__chip"
      :class="{ 'liturgy-custom-bar__chip--active': selectedIndex === index }"
      @click="emit('select', index)"
    >
      <span>{{ liturgy.name }}</span>
      <span
        class="liturgy-custom-bar__remove"
        role="button"
        tabindex="0"
        :aria-label="t('liturgy.actions.delete')"
        @click.stop="emit('remove', index)"
        @keydown.enter.stop="emit('remove', index)"
      >
        <i
          class="ti ti-circle-x"
          aria-hidden="true"
        />
      </span>
    </button>

    <button
      type="button"
      class="liturgy-custom-bar__new"
      @click="emit('create')"
    >
      <i
        class="ti ti-plus"
        aria-hidden="true"
      />
      {{ t('liturgy.custom.new') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.liturgy-custom-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  max-height: 8rem;
  overflow-y: auto;
  padding: 0.75rem 0;
  scrollbar-width: thin;
}

.liturgy-custom-bar__empty {
  margin: 0;
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font-size: 0.875rem;
  opacity: 0.8;
}

.liturgy-custom-bar__chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.35rem 0.65rem 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface-card) 55%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  max-width: 100%;
  overflow-wrap: anywhere;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    color: var(--ds-color-primary);
  }
}

.liturgy-custom-bar__remove {
  display: inline-flex;
  opacity: 0.55;
  cursor: pointer;

  &:hover {
    opacity: 1;
  }
}

.liturgy-custom-bar__new {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
  padding: 0.35rem 0.85rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  }
}
</style>
