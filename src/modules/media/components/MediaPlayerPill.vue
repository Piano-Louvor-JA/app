<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useProjectionStore } from '@modules/settings/stores/useProjectionStore'
import MonitorTargetSelect from '@shared/components/MonitorTargetSelect.vue'

import type { MediaPlaybackMode } from '../types/media'

const props = defineProps<{
  title: string
  subtitle: string
  isPlaying: boolean
  hasAudio: boolean
  hasInstrumental: boolean
  mode: MediaPlaybackMode
  currentTimeLabel: string
  durationLabel: string
  progressRatio: number
  volume: number
  projecting: boolean
  playlistOpen: boolean
  audioOnTv: boolean
}>()

const emit = defineEmits<{
  togglePlay: []
  previousSlide: []
  nextSlide: []
  seekRatio: [ratio: number]
  'update:volume': [value: number]
  'update:mode': [mode: MediaPlaybackMode]
  toggleProjection: []
  toggleAudioOnTv: []
  togglePlaylist: []
  toggleFullscreen: []
}>()

const { t } = useI18n()
const modeMenuOpen = ref(false)
const volumeOpen = ref(false)

const { hasSelectedAudienceTargets } = storeToRefs(useProjectionStore())

/** Parar sempre liberado; iniciar exige tela estendida selecionada. */
const canToggleProjection = computed(
  () => props.projecting || hasSelectedAudienceTargets.value,
)

const projectAriaLabel = computed(() => {
  if (!canToggleProjection.value) return t('monitors.projectNeedsScreens')
  return props.projecting ? t('media.clearProjection') : t('media.project')
})

const modeIcon = computed(() => {
  if (props.mode === 'instrumental') return 'ti-piano'
  if (props.mode === 'no_audio') return 'ti-device-desktop'
  return 'ti-microphone'
})

function onSeekInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('seekRatio', Number(target.value) / 100)
}

function onVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:volume', Number(target.value) / 100)
}

function selectMode(mode: MediaPlaybackMode) {
  modeMenuOpen.value = false
  emit('update:mode', mode)
}
</script>

<template>
  <div class="media-player-pill">
    <div class="media-player-pill__info">
      <span class="media-player-pill__title">{{ title }}</span>
      <span
        v-if="subtitle"
        class="media-player-pill__subtitle"
      >{{ subtitle }}</span>
    </div>

    <div class="media-player-pill__transport">
      <button
        type="button"
        class="media-player-pill__icon-btn"
        :aria-label="t('media.previousSlide')"
        :title="t('media.previousSlide')"
        @click="emit('previousSlide')"
      >
        <i
          class="ti ti-player-skip-back"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-pill__play"
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
        class="media-player-pill__icon-btn"
        :aria-label="t('media.nextSlide')"
        :title="t('media.nextSlide')"
        @click="emit('nextSlide')"
      >
        <i
          class="ti ti-player-skip-forward"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-if="hasAudio"
      class="media-player-pill__timeline"
    >
      <span>{{ currentTimeLabel }}</span>
      <input
        class="media-player-pill__seek"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="progressRatio * 100"
        :aria-label="t('media.seek')"
        @input="onSeekInput"
      >
      <span>{{ durationLabel }}</span>
    </div>

    <div class="media-player-pill__actions">
      <div
        v-if="hasAudio"
        class="media-player-pill__menu-wrap"
      >
        <button
          type="button"
          class="media-player-pill__icon-btn"
          :aria-label="t('media.volume')"
          :title="t('media.volume')"
          @click="volumeOpen = !volumeOpen"
        >
          <i
            class="ti ti-volume"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="volumeOpen"
          class="media-player-pill__volume-pop"
        >
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="volume * 100"
            :aria-label="t('media.volume')"
            @input="onVolumeInput"
          >
        </div>
      </div>

      <div class="media-player-pill__menu-wrap">
        <button
          type="button"
          class="media-player-pill__icon-btn"
          :aria-label="t('media.audioType')"
          :title="t('media.audioType')"
          @click="modeMenuOpen = !modeMenuOpen"
        >
          <i
            class="ti"
            :class="modeIcon"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="modeMenuOpen"
          class="media-player-pill__mode-pop"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            :class="{ 'is-active': mode === 'audio' }"
            @click="selectMode('audio')"
          >
            <i
              class="ti ti-player-play"
              aria-hidden="true"
            />
            {{ t('media.modes.sung') }}
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="!hasInstrumental"
            :class="{ 'is-active': mode === 'instrumental' }"
            @click="selectMode('instrumental')"
          >
            <i
              class="ti ti-player-play"
              aria-hidden="true"
            />
            {{ t('media.modes.instrumental') }}
          </button>
          <button
            type="button"
            role="menuitem"
            :class="{ 'is-active': mode === 'no_audio' }"
            @click="selectMode('no_audio')"
          >
            <i
              class="ti ti-device-desktop"
              aria-hidden="true"
            />
            {{ t('media.modes.noAudio') }}
          </button>
        </div>
      </div>

      <MonitorTargetSelect
        dense
        persist
      />

      <button
        type="button"
        class="media-player-pill__icon-btn"
        :class="{ 'is-on': audioOnTv }"
        :aria-label="audioOnTv ? t('media.audioOnTvOff') : t('media.audioOnTv')"
        :title="audioOnTv ? t('media.audioOnTvOff') : t('media.audioOnTv')"
        @click="emit('toggleAudioOnTv')"
      >
        <i
          class="ti"
          :class="audioOnTv ? 'ti-speakerphone' : 'ti-device-speaker'"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-pill__icon-btn"
        :class="{ 'is-on': projecting }"
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
        class="media-player-pill__icon-btn"
        :aria-label="t('media.fullscreen')"
        :title="t('media.fullscreen')"
        @click="emit('toggleFullscreen')"
      >
        <i
          class="ti ti-maximize"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-player-pill__icon-btn"
        :class="{ 'is-on': playlistOpen }"
        :aria-label="t('media.playlist')"
        :title="t('media.playlist')"
        @click="emit('togglePlaylist')"
      >
        <i
          class="ti ti-list"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-player-pill {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.85rem 1.1rem;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 0.7rem 1.25rem;
  border-radius: var(--ds-radius-xl, 24px 0 24px 0);
  background: rgb(24 24 24 / 0.88);
  border: 1px solid rgb(255 255 255 / 0.12);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
  color: #fff;
}

.media-player-pill__info {
  display: flex;
  flex-direction: column;
  min-width: 8rem;
  max-width: 13rem;
}

.media-player-pill__title {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-player-pill__subtitle {
  font-size: 0.72rem;
  color: rgb(255 255 255 / 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-player-pill__transport {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.media-player-pill__timeline {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1 1 12rem;
  min-width: 10rem;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.media-player-pill__seek {
  flex: 1;
  accent-color: #fff;
}

.media-player-pill__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
}

.media-player-pill__icon-btn,
.media-player-pill__play {
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &.is-on {
    color: var(--ds-color-primary, #2196f3);
  }
}

.media-player-pill__icon-btn {
  width: 2.1rem;
  height: 2.1rem;

  .ti {
    font-size: 1.25rem;
  }

  &:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.1);
  }
}

.media-player-pill__play {
  width: 2.7rem;
  height: 2.7rem;

  .ti {
    font-size: 2.1rem;
  }
}

.media-player-pill__menu-wrap {
  position: relative;
}

.media-player-pill__volume-pop,
.media-player-pill__mode-pop {
  position: absolute;
  bottom: calc(100% + 0.55rem);
  right: 0;
  z-index: 5;
  border-radius: 0.75rem 0 0.75rem 0;
  background: rgb(20 20 20 / 0.95);
  border: 1px solid rgb(255 255 255 / 0.12);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.4);
}

.media-player-pill__volume-pop {
  padding: 0.55rem 0.75rem;
  min-width: 8rem;

  input {
    width: 100%;
    accent-color: #fff;
  }
}

.media-player-pill__mode-pop {
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  padding: 0.35rem;

  button {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    border: none;
    background: transparent;
    color: #fff;
    text-align: left;
    padding: 0.55rem 0.65rem;
    border-radius: 0.55rem 0 0.55rem 0;
    cursor: pointer;
    font-size: 0.85rem;

    &:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.08);
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    &.is-active {
      background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 35%, transparent);
    }
  }
}

@media (max-width: 780px) {
  .media-player-pill {
    border-radius: 1.25rem 0 1.25rem 0;
  }

  .media-player-pill__info {
    max-width: 100%;
    width: 100%;
  }
}

@media (max-width: 1280px) {
  .media-player-pill {
    gap: 0.55rem 0.75rem;
    padding: 0.5rem 0.9rem;
  }

  .media-player-pill__play {
    width: 2.3rem;
    height: 2.3rem;

    .ti {
      font-size: 1.75rem;
    }
  }

  .media-player-pill__icon-btn {
    width: 1.85rem;
    height: 1.85rem;

    .ti {
      font-size: 1.1rem;
    }
  }
}
</style>
