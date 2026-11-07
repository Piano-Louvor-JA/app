<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { GlassCard } from '@design-system/index'
import FontPicker from './FontPicker.vue'

withDefaults(defineProps<{ scope?: string; compact?: boolean }>(), { scope: 'system', compact: false })
const { t } = useI18n()
const open = ref(false)
const panelId = useId()
</script>

<template>
  <GlassCard class="font-selector" :class="{ 'font-selector--compact': compact }" :padding="false">
    <button
      type="button"
      class="font-selector__header"
      data-font-toggle
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="font-selector__icon"><i class="ti ti-typography" aria-hidden="true" /></span>
      <span class="font-selector__heading">
        <span class="font-selector__title">{{ t('settings.fonts.title') }}</span>
        <span class="font-selector__subtitle">{{ t(scope === 'system' ? 'settings.fonts.systemHint' : 'settings.fonts.projectionHint') }}</span>
      </span>
      <span v-if="!compact && !open" class="font-selector__explore">{{ t('settings.fonts.explore') }}</span>
      <i class="ti ti-chevron-down font-selector__chevron" :class="{ 'font-selector__chevron--open': open }" aria-hidden="true" />
    </button>
    <div v-if="open" :id="panelId" class="font-selector__body">
      <FontPicker :key="scope" :scope="scope" :compact="compact" />
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.font-selector {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.font-selector__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 1.5rem;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  text-align: left;
  cursor: pointer;
}

.font-selector__icon {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-md);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);
  font-size: 24px;
}

.font-selector__heading { display: grid; gap: .3rem; min-width: 0; }
.font-selector__title { font-size: 18px; font-weight: 600; line-height: 24px; }
.font-selector__subtitle { color: var(--ds-color-on-surface-variant); font-size: 12px; line-height: 18px; }
.font-selector__explore { margin-left: auto; flex-shrink: 0; color: var(--ds-color-primary); font-size: 12px; font-weight: 600; }
.font-selector__chevron { margin-left: auto; color: var(--ds-color-on-surface-variant); transition: transform 180ms ease; }
.font-selector__explore + .font-selector__chevron { margin-left: 0; }
.font-selector__chevron--open { transform: rotate(180deg); }
.font-selector__header:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: -3px; }
.font-selector__body { padding: 0 1.5rem 1.5rem; }

.font-selector--compact {
  .font-selector__header { gap: .65rem; padding: .85rem; }
  .font-selector__icon { width: 2rem; height: 2rem; font-size: 20px; }
  .font-selector__title { font-size: 14px; line-height: 20px; }
  .font-selector__subtitle { display: none; }
  .font-selector__body { padding: 0 .85rem .85rem; }
}

@media (max-width: 1100px) {
  .font-selector__header { padding: 1.1rem; }
  .font-selector__body { padding: 0 1.1rem 1.1rem; }
}
</style>
