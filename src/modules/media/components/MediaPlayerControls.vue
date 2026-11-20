<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useProjectionStore } from '@modules/settings/stores/useProjectionStore'

const props = defineProps<{
  isPlaying: boolean
  hasAudio: boolean
  currentTimeLabel: string
  durationLabel: string
  progressRatio: number
  slideIndex: number
  slideCount: number
  volume: number
  projecting: boolean
}>()

const emit = defineEmits<{
  togglePlay: []
  previousSlide: []
  nextSlide: []
  seekRatio: [ratio: number]
  'update:volume': [value: number]
  toggleProjection: []
  minimize: []
  close: []
}>()

const { t } = useI18n()
const { hasSelectedAudienceTargets } = storeToRefs(useProjectionStore())

const canToggleProjection = computed(
  () => props.projecting || hasSelectedAudienceTargets.value,
)

const projectAriaLabel = computed(() => {
  if (!canToggleProjection.value) return t('monitors.projectNeedsScreens')
  /* v8 ignore next 1 -- ambos os lados cobertos (projeta/oculta), v8 não credita o ternário */
  return props.projecting ? t('media.clearProjection') : t('media.project')
})

function onSeekInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('seekRatio', Number(target.value) / 100)
}

function onVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:volume', Number(target.value) / 100)
}
</script>

<template>
  <div class="media-player-controls">
    <div class="media-player-controls__transport">
      <button
        type="button"
        class="media-player-controls__btn"
        :aria-label="t('media.previousSlide')"
        :title="t('media.previousSlide')"
        :disabled="slideIndex <= 0"
        @click="emit('previousSlide')"
      >
        <i
          class="ti ti-player-skip-back"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-controls__btn media-player-controls__btn--primary"
        :aria-label="isPlaying ? t('media.pause') : t('media.play')"
        :title="isPlaying ? t('media.pause') : t('media.play')"
        :disabled="!hasAudio"
        @click="emit('togglePlay')"
      >
        <i
          class="ti"
          :class="isPlaying ? 'ti-player-pause' : 'ti-player-play'"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-controls__btn"
        :aria-label="t('media.nextSlide')"
        :title="t('media.nextSlide')"
        :disabled="slideIndex >= slideCount - 1"
        @click="emit('nextSlide')"
      >
        <i
          class="ti ti-player-skip-forward"
          aria-hidden="true"
        />
      </button>
    </div>

    <div class="media-player-controls__timeline">
      <span class="media-player-controls__time">{{ currentTimeLabel }}</span>
      <input
        class="media-player-controls__seek"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="progressRatio * 100"
        :disabled="!hasAudio"
        :aria-label="t('media.seek')"
        @input="onSeekInput"
      >
      <span class="media-player-controls__time">{{ durationLabel }}</span>
    </div>

    <div class="media-player-controls__meta">
      <span class="media-player-controls__slides">
        {{ t('media.slideOf', { current: slideIndex + 1, total: slideCount }) }}
      </span>

      <label class="media-player-controls__volume">
        <i
          class="ti ti-volume"
          aria-hidden="true"
        />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="volume * 100"
          :aria-label="t('media.volume')"
          @input="onVolumeInput"
        >
      </label>

      <button
        type="button"
        class="media-player-controls__btn"
        :class="{ 'media-player-controls__btn--on': projecting }"
        :disabled="!canToggleProjection"
        :aria-label="projectAriaLabel"
        :title="projectAriaLabel"
        @click="emit('toggleProjection')"
      >
        <i
          class="ti"
          :class="projecting ? 'ti-player-stop' : 'ti-presentation'"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-controls__btn"
        :aria-label="t('media.minimize')"
        :title="t('media.minimize')"
        @click="emit('minimize')"
      >
        <i
          class="ti ti-arrows-minimize"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-controls__btn media-player-controls__btn--danger"
        :aria-label="t('media.close')"
        :title="t('media.close')"
        @click="emit('close')"
      >
        <i
          class="ti ti-x"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-player-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.25rem;
  padding: 0.85rem 1.1rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  backdrop-filter: blur(12px);
}

.media-player-controls__transport,
.media-player-controls__meta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.media-player-controls__timeline {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex: 1 1 14rem;
  min-width: 12rem;
}

.media-player-controls__time {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-on-surface-variant);
  min-width: 2.5rem;
}

.media-player-controls__seek,
.media-player-controls__volume input {
  width: 100%;
  accent-color: var(--ds-color-primary);
}

.media-player-controls__volume {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--ds-color-on-surface-variant);

  input {
    width: 5rem;
  }
}

.media-player-controls__slides {
  font-size: 0.75rem;
  color: var(--ds-color-on-surface-variant);
  margin-right: 0.35rem;
}

.media-player-controls__btn {
  width: 2.4rem;
  height: 2.4rem;
  border: none;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;

  .ti {
    font-size: 1.35rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--primary {
    width: 2.9rem;
    height: 2.9rem;
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ds-color-primary) 85%, #fff);
    }
  }

  &--on {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 70%, transparent);
  }

  &--danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 35%, transparent);
  }
}
</style>
