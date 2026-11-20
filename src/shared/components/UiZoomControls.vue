<script setup lang="ts">
import { useUiZoom } from "@shared/composables/useUiZoom";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { zoomPercent, canZoomIn, canZoomOut, zoomIn, zoomOut } = useUiZoom();
</script>

<template>
  <div
    class="ui-zoom-controls"
    role="group"
    :aria-label="t('uiZoom.label')"
  >
    <button
      type="button"
      class="ui-zoom-controls__btn"
      :disabled="!canZoomOut"
      :aria-label="t('uiZoom.zoomOut')"
      :title="t('uiZoom.zoomOut')"
      @click="zoomOut"
    >
      <i
        class="ti ti-minus"
        aria-hidden="true"
      />
    </button>

    <span
      class="ui-zoom-controls__value"
      aria-live="polite"
    >
      {{ zoomPercent }}%
    </span>

    <button
      type="button"
      class="ui-zoom-controls__btn"
      :disabled="!canZoomIn"
      :aria-label="t('uiZoom.zoomIn')"
      :title="t('uiZoom.zoomIn')"
      @click="zoomIn"
    >
      <i
        class="ti ti-plus"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped lang="scss">
.ui-zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.ui-zoom-controls__btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1.1rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
}

.ui-zoom-controls__value {
  min-width: 2.75rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-on-surface-variant);
  user-select: none;
}
</style>
