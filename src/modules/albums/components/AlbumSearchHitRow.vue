<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MusicTrackActions from '@shared/components/MusicTrackActions.vue'
import type { AlbumSearchHit } from '../types/albums'

const props = defineProps<{
  hit: AlbumSearchHit
  selected?: boolean
  alreadyAdded?: boolean
  prominentPlaylist?: boolean
  artworkUrl?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  playlist: []
  sung: []
  instrumental: []
  slides: []
  lyric: []
}>()

const { t } = useI18n()
const rowHovered = ref(false)
const downloadProgress = ref<number | null>(null)
const isDownloading = computed(() => downloadProgress.value != null)

function onDownloadProgress(progress: number | null) {
  downloadProgress.value = progress
}

function playSungFromRow() {
  if (props.prominentPlaylist || props.busy || isDownloading.value) return
  emit('sung')
}
</script>

<template>
  <div
    class="album-search-hit"
    :class="{ 'album-search-hit--downloading': isDownloading, 'album-search-hit--playlist-picker': prominentPlaylist, 'album-search-hit--added': alreadyAdded, 'album-search-hit--selected': selected }"
    :role="prominentPlaylist ? undefined : 'button'"
    :tabindex="prominentPlaylist ? undefined : 0"
    :aria-label="prominentPlaylist ? undefined : t('media.actions.sung')"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
    @click="playSungFromRow"
    @keydown.enter.prevent="playSungFromRow"
    @keydown.space.prevent="playSungFromRow"
  >
    <div
      v-if="isDownloading"
      class="album-search-hit__download-overlay"
      aria-live="polite"
    >
      <div
        class="album-search-hit__download-fill"
        :style="{ width: `${downloadProgress}%` }"
        aria-hidden="true"
      />
      <span class="album-search-hit__download-percent">
        {{ downloadProgress }}%
      </span>
    </div>

    <span class="album-search-hit__leading">
      <span v-if="hit.isHymnal && hit.track != null" class="album-search-hit__number">{{ hit.track }}</span>
      <span v-else aria-hidden="true">—</span>
    </span>
    <span class="album-search-hit__info">
      <span class="album-search-hit__artwork" aria-hidden="true">
        <img v-if="artworkUrl" :src="artworkUrl" alt="">
        <i v-else class="ti ti-music" />
      </span>
      <span class="album-search-hit__text">
        <span class="album-search-hit__title">{{ hit.name }}</span>
        <span class="album-search-hit__subtitle">{{ hit.albumNames }}</span>
      </span>
    </span>

    <button v-if="prominentPlaylist" type="button"
      class="album-search-hit__playlist album-search-hit__playlist--prominent"
      :disabled="busy || isDownloading || alreadyAdded" :title="t(alreadyAdded ? 'albums.playlists.inPlaylist' : 'common.addToPlaylist')" :aria-label="t(alreadyAdded ? 'albums.playlists.inPlaylist' : 'common.addToPlaylist')"
      @click.stop="emit('playlist')" @keydown.enter.stop @keydown.space.stop>
      <i class="ti" :class="alreadyAdded ? 'ti-check' : 'ti-playlist-add'" aria-hidden="true" />
    </button>

    <span class="album-search-hit__duration">
      {{ hit.durationLabel }}
    </span>

    <div class="album-search-hit__actions">
      <button v-if="!prominentPlaylist" type="button" class="album-search-hit__playlist" :disabled="busy || isDownloading"
        :title="t('common.addToPlaylist')" :aria-label="t('common.addToPlaylist')"
        @click.stop="emit('playlist')" @keydown.enter.stop @keydown.space.stop>
        <i class="ti ti-playlist-add" aria-hidden="true" />
      </button>
      <MusicTrackActions
        :music-id="hit.musicId"
        :track-name="hit.name"
        :has-instrumental="hit.hasInstrumental"
        :busy="busy"
        :row-hovered="rowHovered"
        variant="contained"
        @sung="emit('sung')"
        @instrumental="emit('instrumental')"
        @slides="emit('slides')"
        @lyric="emit('lyric')"
        @download-progress="onDownloadProgress"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.album-search-hit {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) 7rem 16rem;
  align-items: center;
  gap: 0.75rem;
  min-height: 5rem;
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(
    in srgb,
    var(--ds-color-surface-elevated) var(--ds-glass-fill, 72%),
    transparent
  );
  color: var(--ds-color-on-surface);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    border-color var(--ds-motion-duration, 280ms) ease,
    transform 160ms ease;

  &:hover {
    border-color: color-mix(
      in srgb,
      var(--ds-color-on-surface) 15%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--ds-color-surface-container-high) 82%,
      transparent
    );
  }

  &--downloading {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.album-search-hit__download-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.album-search-hit__download-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ds-color-primary) 28%, transparent),
    color-mix(in srgb, var(--ds-color-primary) 48%, transparent)
  );
  transition: width 200ms ease;
}

.album-search-hit__download-percent {
  position: relative;
  z-index: 1;
  color: var(--ds-color-primary);
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px rgb(0 0 0 / 45%);
}

.album-search-hit__leading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.5rem;
}

.album-search-hit__number {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ds-color-on-surface-variant);
  transition: opacity 140ms ease;
}

.album-search-hit__play {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-primary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;

  .ti {
    font-size: 1.35rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.08);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
}

.album-search-hit:hover .album-search-hit__number,
.album-search-hit:focus-within .album-search-hit__number {
  opacity: 0;
}

.album-search-hit:hover .album-search-hit__play,
.album-search-hit:focus-within .album-search-hit__play {
  opacity: 1;
  pointer-events: auto;
}

.album-search-hit__info {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.album-search-hit__artwork {
  width: 3rem;
  height: 3rem;
  border-radius: 0.65rem 0 0.65rem 0;
  overflow: hidden;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .ti {
    font-size: 1.35rem;
    color: var(--ds-color-primary);
  }
}

.album-search-hit__text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.album-search-hit__title {
  font-weight: 650;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-search-hit__subtitle {
  font-size: 0.8rem;
  color: var(--ds-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-search-hit__duration {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: var(--ds-color-on-surface-variant);
  text-align: center;
}

.album-search-hit__playlist {
  border: 0;
  border-radius: 999px;
  padding: 0.35rem;
  background: transparent;
  color: var(--ds-color-primary);
  cursor: pointer;
}

.album-search-hit__playlist:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.album-search-hit__actions {
  position: relative;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-self: end;
}

.album-search-hit--selected {
  border-color: var(--ds-color-primary);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, var(--ds-color-surface-elevated));
  box-shadow: inset 3px 0 var(--ds-color-primary);
}
.album-search-hit--added {
  opacity: .5;
  .album-search-hit__playlist--prominent:disabled { opacity: 1; background: var(--ds-color-surface-elevated); color: var(--ds-color-on-surface-variant); border-color: var(--ds-color-outline-strong); }
}
.album-search-hit--playlist-picker {
  cursor: default;
  grid-template-columns: 4rem minmax(0, 1fr) 4rem 7rem 16rem;
  .album-search-hit__duration { grid-column: 4; }
  .album-search-hit__actions { grid-column: 5; }
}
.album-search-hit__playlist--prominent {
  position: relative;
  z-index: 6;
  grid-column: 3;
  justify-self: center;
  width: 3rem;
  height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #171717);
  font-size: 1.5rem;
  border: 1px solid var(--ds-color-primary);
  &:hover:not(:disabled) { filter: brightness(1.15); }
  &:focus-visible { outline: 2px solid var(--ds-color-on-surface); outline-offset: 3px; }
}
@media (max-width: 1000px) {
  .album-search-hit__playlist--prominent { position: static; transform: none; grid-column: 3; justify-self: center; }
  .album-search-hit--playlist-picker {
    grid-template-columns: 3rem minmax(0, 1fr) 4rem 4rem auto;
    .album-search-hit__duration { grid-column: 4; }
    .album-search-hit__actions { grid-column: 5; }
  }
}
@media (max-width: 720px) {
  .album-search-hit {
    grid-template-columns: 3rem minmax(0, 1fr);
    grid-template-areas:
      'num title'
      'num duration'
      'num actions';
  }

  .album-search-hit__leading {
    grid-area: num;
  }

  .album-search-hit__info {
    grid-area: title;
  }

  .album-search-hit__duration {
    grid-area: duration;
    text-align: left;
  }

  .album-search-hit__actions {
    grid-area: actions;
    justify-self: start;
  }
}

@media (max-width: 1280px) {
  .album-search-hit {
    min-height: 3.5rem;
    padding: 0.5rem 0.75rem;
    gap: 0.55rem;
  }
}
@media (max-width: 720px) {
  .album-search-hit--playlist-picker {
    grid-template-columns: 3rem minmax(0, 1fr) 4rem;
    grid-template-areas: 'num title add' 'num duration add' 'num actions actions';
    .album-search-hit__playlist--prominent { grid-area: add; }
    .album-search-hit__duration { grid-column: 2; }
    .album-search-hit__actions { grid-column: 2 / 4; }
  }
}
</style>
