<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { useMonitorArrangement } from '../composables/useMonitorArrangement'
import { useProjectionSettings } from '../composables/useProjectionSettings'

const { t } = useI18n()
const stageRef = ref<HTMLElement | null>(null)

const {
  isLoadingDisplays,
  isIdentifying,
  identifyMonitors,
} = useProjectionSettings()

const {
  tiles,
  draggingId,
  hasCustomArrangement,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  resetLayout,
} = useMonitorArrangement(stageRef)
</script>

<template>
  <GlassCard class="monitor-arrangement" elevated>
    <div class="monitor-arrangement__accent" aria-hidden="true" />

    <div class="monitor-arrangement__header">
      <div class="monitor-arrangement__heading">
        <i class="ti ti-device-desktop monitor-arrangement__icon" aria-hidden="true" />
        <h3 class="monitor-arrangement__title">
          {{ t('settings.projection.monitors.title') }}
        </h3>
      </div>

      <div class="monitor-arrangement__actions">
        <!-- v8 ignore start -- texto do botão some do range do v-if p/ remap v8 -->
        <button
          v-if="hasCustomArrangement"
          type="button"
          class="monitor-arrangement__reset"
          @click="resetLayout"
        >
          <i class="ti ti-restore" aria-hidden="true" />
          <span>{{ t('settings.projection.monitors.resetLayout') }}</span>
        </button>
        <!-- v8 ignore stop -->

        <button
          type="button"
          class="monitor-arrangement__identify"
          :disabled="isIdentifying || isLoadingDisplays || tiles.length === 0"
          @click="identifyMonitors"
        >
          <i class="ti ti-zoom-scan" aria-hidden="true" />
          {{ t('settings.projection.monitors.identify') }}
        </button>
      </div>
    </div>

    <div
      ref="stageRef"
      class="monitor-arrangement__stage"
      :class="{ 'monitor-arrangement__stage--dragging': draggingId != null }"
      :aria-busy="isLoadingDisplays"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <div
        v-if="tiles.length === 0 && !isLoadingDisplays"
        class="monitor-arrangement__empty"
      >
        {{ t('settings.projection.monitors.empty') }}
      </div>

      <article
        v-for="monitor in tiles"
        :key="monitor.id"
        class="monitor-tile"
        :class="{
          'monitor-tile--primary': monitor.isPrimary,
          'monitor-tile--extended': !monitor.isPrimary,
          'monitor-tile--dragging': draggingId === monitor.id,
        }"
        :style="{
          width: `${monitor.width}px`,
          height: `${monitor.height + 22}px`,
          transform: `translate(${monitor.left}px, ${monitor.top}px)`,
          zIndex: draggingId === monitor.id ? 20 : monitor.isPrimary ? 5 : 2,
        }"
        :aria-grabbed="draggingId === monitor.id"
        :aria-label="`${monitor.label}, ${monitor.resolutionLabel}`"
        @pointerdown="onPointerDown($event, monitor.id)"
      >
        <div
          class="monitor-tile__screen"
          :style="{ height: `${monitor.height}px` }"
        >
          <i
            v-if="monitor.isPrimary"
            class="ti ti-star monitor-tile__star"
            aria-hidden="true"
          />
          <span class="monitor-tile__index">{{ monitor.index }}</span>
          <span class="monitor-tile__resolution">{{ monitor.resolutionLabel }}</span>
          <span
            class="monitor-tile__badge"
            :class="{ 'monitor-tile__badge--primary': monitor.isPrimary }"
          >
            {{
              monitor.isPrimary
                ? t('settings.projection.monitors.primary')
                : t('settings.projection.monitors.extended')
            }}
          </span>
        </div>
        <div class="monitor-tile__stand" aria-hidden="true" />
        <div class="monitor-tile__base" aria-hidden="true" />
      </article>
    </div>

    <p class="monitor-arrangement__hint">
      {{ t('settings.projection.monitors.hint') }}
    </p>
  </GlassCard>
</template>

<style scoped lang="scss">
.monitor-arrangement {
  position: relative;
  overflow: hidden;
  padding: 2rem;
}

.monitor-arrangement__accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--ds-color-primary);
}

.monitor-arrangement__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-left: 0.5rem;
}

.monitor-arrangement__heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.monitor-arrangement__icon {
  color: var(--ds-color-primary);
  font-size: 24px;
  line-height: 1;
}

.monitor-arrangement__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.monitor-arrangement__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.monitor-arrangement__identify,
.monitor-arrangement__reset {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: var(--ds-radius-full);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  transition:
    background-color 200ms ease,
    transform 150ms ease,
    opacity 150ms ease;

  .ti {
    font-size: 20px;
    line-height: 1;
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.monitor-arrangement__identify {
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }
}

.monitor-arrangement__reset {
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: var(--ds-color-on-surface-variant);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
    color: var(--ds-color-on-surface);
  }
}

.monitor-arrangement__stage {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 22rem;
  height: 22rem;
  border-radius: var(--ds-radius-lg);
  background:
    radial-gradient(
      circle at 50% 40%,
      color-mix(in srgb, var(--ds-color-primary) 14%, transparent),
      transparent 55%
    ),
    color-mix(in srgb, var(--ds-color-on-surface) 3%, transparent);
  touch-action: none;
  user-select: none;

  &--dragging {
    cursor: grabbing;
  }
}

.monitor-arrangement__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  text-align: center;
  opacity: 0.75;
}

.monitor-tile {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  container-type: size;
  cursor: grab;
  touch-action: none;
  will-change: transform;
  transition: filter 160ms ease;

  &:hover:not(.monitor-tile--dragging) {
    filter: brightness(1.06);
  }

  &--dragging {
    cursor: grabbing;
    filter: drop-shadow(0 16px 28px rgb(0 0 0 / 0.35));
  }
}

.monitor-tile__screen {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
  padding: 0.35rem;
  border-radius: var(--ds-radius-lg);
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface-container-high) 70%, transparent);
  color: var(--ds-color-on-surface-variant);
  backdrop-filter: blur(12px);
}

.monitor-tile--primary .monitor-tile__screen {
  border-color: color-mix(in srgb, var(--ds-color-primary) 50%, transparent);
  background: linear-gradient(
    135deg,
    var(--ds-color-primary) 0%,
    color-mix(in srgb, var(--ds-color-primary) 65%, #00497d) 100%
  );
  color: #fff;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 50%, transparent),
    0 0 40px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
}

.monitor-tile__star {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  color: #fde047;
  font-size: 16px;
  line-height: 1;
  pointer-events: none;
}

.monitor-tile__index {
  font-size: clamp(1.1rem, 12cqi, 1.75rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  pointer-events: none;
}

.monitor-tile--primary .monitor-tile__index {
  font-size: clamp(1.25rem, 14cqi, 2rem);
}

.monitor-tile__resolution {
  margin-top: 0.2rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(8px, 5cqi, 11px);
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.75;
  pointer-events: none;
}

.monitor-tile__badge {
  margin-top: 0.35rem;
  max-width: 100%;
  padding: 0.15rem 0.45rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  border-radius: var(--ds-radius-full);
  font-size: clamp(7px, 4.5cqi, 9px);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.7;
  pointer-events: none;

  &--primary {
    border: 0;
    background: color-mix(in srgb, #fff 20%, transparent);
    color: #fff;
    letter-spacing: 0.16em;
    opacity: 1;
  }
}

.monitor-tile__stand {
  width: 1.5rem;
  height: 0.55rem;
  background: color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  pointer-events: none;
}

.monitor-tile--primary .monitor-tile__stand {
  background: color-mix(in srgb, var(--ds-color-primary) 80%, transparent);
}

.monitor-tile__base {
  width: 3.75rem;
  height: 4px;
  border-radius: var(--ds-radius-full);
  background: color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  pointer-events: none;
}

.monitor-tile--primary .monitor-tile__base {
  background: var(--ds-color-primary);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
}

.monitor-arrangement__hint {
  margin: 1.25rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  font-style: italic;
  line-height: 20px;
  text-align: center;
  opacity: 0.6;
}
</style>
