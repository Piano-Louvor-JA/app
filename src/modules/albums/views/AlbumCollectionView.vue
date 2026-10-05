<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { MediaCollectionList } from '@design-system/index'

import AlbumLyricDialog from '../components/AlbumLyricDialog.vue'
import AlbumTrackRow from '../components/AlbumTrackRow.vue'
import { useAlbums } from '../composables/useAlbums'
import {
  addPlaylistItem,
  listPlaylists,
  type PlaylistItem,
} from '../services/playlist-storage'
import type { AlbumTrack } from '../types/albums'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const {
  activeCollection,
  filteredTracks,
  searchQuery,
  isLoadingTracks,
  lastErrorKey,
  lastActionMessageKey,
  lyricOpen,
  lyricDoc,
  isLoadingLyric,
  openCollection,
  clearError,
  clearActionMessage,
  playSung,
  playInstrumental,
  playSlides,
  playAllInActiveCollection,
  openLyric,
  closeLyric,
} = useAlbums()

const busyMusicId = ref<number | null>(null)
const playlistItem = ref<PlaylistItem | null>(null)
const playlists = ref(listPlaylists())
const playlistFeedback = ref('')

let feedbackTimer: ReturnType<typeof setTimeout> | null = null

function showPlaylistFeedback(message: string) {
  playlistFeedback.value = message
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    playlistFeedback.value = ''
  }, 2600)
}

onBeforeUnmount(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
})

const collectionId = computed(() => String(route.params.collectionId ?? ''))

const title = computed(
  () => activeCollection.value?.name || t('albums.collectionFallback'),
)

async function load() {
  clearError()
  await openCollection(collectionId.value)
}

onMounted(() => {
  void load()
})

watch(collectionId, () => {
  void load()
})

function goBack() {
  void router.push({ name: 'albums' })
}

function closePlaylistPicker() {
  playlistItem.value = null
}

function openPlaylistPicker(track: AlbumTrack) {
  playlistItem.value = {
    musicId: track.musicId,
    albumId: /* v8 ignore next */ Number(activeCollection.value?.id) || null,
    title: track.name,
  }
}

function addToPlaylist(id: string) {
  const item = playlistItem.value
  /* v8 ignore next -- defensivo: picker só abre com item */ if (!item) return
  const target = playlists.value.find((playlist) => playlist.id === id)
  const result = addPlaylistItem(id, item)
  playlists.value = listPlaylists()
  playlistItem.value = null
  if (result?.added) {
    showPlaylistFeedback(`“${item.title}” adicionada a “${/* v8 ignore next */ target?.name ?? 'playlist'}”`)
  } else {
    showPlaylistFeedback(`“${item.title}” já está em “${/* v8 ignore next */ target?.name ?? 'playlist'}”`)
  }
}

async function runAction(
  musicId: number,
  action: () => Promise<boolean | void>,
) {
  busyMusicId.value = musicId
  try {
    await action()
  } finally {
    busyMusicId.value = null
  }
}
</script>

<template>
  <section class="album-collection-view">
    <header class="album-collection-view__header">
      <div class="album-collection-view__brand">
        <button
          type="button"
          class="album-collection-view__back"
          :aria-label="t('albums.back')"
          :title="t('albums.back')"
          @click="goBack"
        >
          <i
            class="ti ti-arrow-left"
            aria-hidden="true"
          />
        </button>

        <div class="album-collection-view__icon">
          <i
            class="ti"
            :class="
              activeCollection?.kind === 'hymnal'
                ? 'ti-book'
                : 'ti-disc'
            "
            aria-hidden="true"
          />
        </div>

        <h1 class="album-collection-view__title">
          {{ title }}
        </h1>
      </div>

      <button
        v-if="activeCollection?.kind !== 'hymnal' && filteredTracks.length > 0"
        type="button"
        class="album-collection-view__play-all"
        :aria-label="t('albums.playAll')"
        :title="t('albums.playAll')"
        @click="playAllInActiveCollection()"
      >
        <i class="ti ti-player-play" aria-hidden="true" />
        {{ t('albums.playAll') }}
      </button>
    </header>

    <div
      v-if="lastActionMessageKey && !lastActionMessageKey.startsWith('media.messages.')"
      class="album-collection-view__alert"
      role="status"
    >
      <p>{{ t(lastActionMessageKey) }}</p>
      <button
        type="button"
        @click="clearActionMessage"
      >
        {{ t('albums.dismiss') }}
      </button>
    </div>

    <div
      v-if="lastErrorKey"
      class="album-collection-view__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <button
        type="button"
        @click="load"
      >
        {{ t('albums.retry') }}
      </button>
    </div>

    <MediaCollectionList
      v-model="searchQuery"
      :search-placeholder="t('albums.searchPlaceholder')"
      :search-aria-label="t('albums.searchPlaceholder')"
      :clear-aria-label="t('albums.clearSearch')"
      :number-label="t('albums.columns.number')"
      :title-label="t('albums.columns.title')"
      :duration-label="t('albums.columns.duration')"
      :actions-label="t('albums.columns.actions')"
      :loading="isLoadingTracks"
      :loading-label="t('albums.loading')"
      :empty="!isLoadingTracks && filteredTracks.length === 0"
      :empty-label="
        searchQuery.trim()
          ? t('albums.messages.searchEmpty')
          : t('albums.messages.tracksEmpty')
      "
    >
      <AlbumTrackRow
        v-for="track in filteredTracks"
        :key="track.musicId"
        :track="track"
        :collection-name="title"
        :artwork-url="activeCollection?.coverUrl"
        :busy="busyMusicId === track.musicId"
        @sung="runAction(track.musicId, () => playSung(track.musicId))"
        @instrumental="
          runAction(track.musicId, () => playInstrumental(track.musicId))
        "
        @slides="runAction(track.musicId, () => playSlides(track.musicId))"
        @lyric="runAction(track.musicId, () => openLyric(track.musicId))"
        @playlist="openPlaylistPicker(track)"
      />
    </MediaCollectionList>

    <Teleport to="body">
      <Transition name="playlist-toast">
        <div v-if="playlistFeedback" class="playlist-toast" role="status" aria-live="polite">
          <i class="ti ti-circle-check" aria-hidden="true" />
          {{ playlistFeedback }}
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="playlist-picker">
        <div
          v-if="playlistItem"
          class="playlist-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Adicionar à playlist"
          @click.self="closePlaylistPicker"
          @keydown.esc="closePlaylistPicker"
        >
          <div class="playlist-picker__panel">
            <header class="playlist-picker__header">
              <div class="playlist-picker__track">
                <span class="playlist-picker__track-icon">
                  <i class="ti ti-music" aria-hidden="true" />
                </span>
                <div class="playlist-picker__track-info">
                  <small>Adicionar à playlist</small>
                  <strong>{{ playlistItem.title }}</strong>
                </div>
              </div>
              <button
                type="button"
                class="playlist-picker__close"
                aria-label="Fechar"
                @click="closePlaylistPicker"
              >
                <i class="ti ti-x" aria-hidden="true" />
              </button>
            </header>

            <div class="playlist-picker__body">
              <p v-if="playlists.length === 0" class="playlist-picker__empty">
                <i class="ti ti-music-plus" aria-hidden="true" />
                Você ainda não tem playlists.<br>
                Crie uma na seção Playlists da Biblioteca.
              </p>
              <button
                v-for="playlist in playlists"
                :key="playlist.id"
                type="button"
                class="playlist-picker__option"
                @click="addToPlaylist(playlist.id)"
              >
                <i class="ti ti-playlist" aria-hidden="true" />
                <span class="playlist-picker__name">{{ playlist.name }}</span>
                <small class="playlist-picker__count">{{ playlist.items.length }}</small>
                <i class="ti ti-plus playlist-picker__add" aria-hidden="true" />
              </button>
            </div>

            <footer class="playlist-picker__footer">
              <button type="button" class="playlist-picker__cancel" @click="closePlaylistPicker">
                Cancelar
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />
  </section>
</template>

<style scoped lang="scss">
.album-collection-view {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-sizing: border-box;
  min-height: 0;
  padding: 0.75rem var(--ds-spacing-page, 2rem) 1rem;
  overflow: hidden;
}

.album-collection-view__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;
}

.album-collection-view__play-all {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  border: 0;
  border-radius: 0.7rem;
  padding: 0.6rem 0.85rem;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.album-collection-view__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.album-collection-view__back {
  width: 2.4rem;
  height: 2.4rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 80%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }
}

.album-collection-view__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem 0 0.75rem 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  flex-shrink: 0;

  .ti {
    font-size: 1.35rem;
  }
}

.album-collection-view__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-collection-view__alert {
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 72%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  padding: 1.25rem 1.4rem;
  color: var(--ds-color-on-surface-variant);
}

.album-collection-view__alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;

  button {
    border: 1px solid var(--ds-color-outline-strong);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    cursor: pointer;
  }
}

/* Picker de adicionar à playlist — design system (raio assimétrico da marca) */
.playlist-picker {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(4px);
}

.playlist-picker__panel {
  display: flex;
  flex-direction: column;
  width: min(26rem, calc(100vw - 2rem));
  max-height: min(30rem, calc(100vh - 4rem));
  border: 1px solid var(--ds-color-outline-strong, rgba(255, 255, 255, 0.10));
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-card, #242424);
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
  overflow: hidden;
}

.playlist-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.05));
  background: color-mix(in srgb, var(--ds-color-surface-container, #201f1f) 70%, transparent);
}

.playlist-picker__track {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.playlist-picker__track-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 18%, transparent);
  color: var(--ds-color-primary, #2196f3);
  font-size: 1.1rem;
}

.playlist-picker__track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.playlist-picker__track-info small {
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.playlist-picker__track-info strong {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ds-color-on-surface, #e5e2e1);
}

.playlist-picker__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.playlist-picker__close:hover {
  background: var(--ds-color-surface-variant, #353534);
  color: var(--ds-color-on-surface, #e5e2e1);
}

.playlist-picker__body {
  flex: 1;
  overflow-y: auto;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.playlist-picker__option {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface, #e5e2e1);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.playlist-picker__option > .ti-playlist {
  color: var(--ds-color-primary, #2196f3);
  flex-shrink: 0;
}
.playlist-picker__option:hover {
  border-color: color-mix(in srgb, var(--ds-color-primary, #2196f3) 40%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 8%, transparent);
}

.playlist-picker__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-picker__count {
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.72rem;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-surface-variant, #353534) 70%, transparent);
  flex-shrink: 0;
}

.playlist-picker__add {
  font-size: 0.8rem;
  color: var(--ds-color-primary, #2196f3);
  opacity: 0;
  transform: translateX(-0.25rem);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.playlist-picker__option:hover .playlist-picker__add {
  opacity: 1;
  transform: translateX(0);
}

.playlist-picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.6rem 1rem;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.85rem;
  text-align: center;
  border: 1px dashed var(--ds-color-outline-strong, rgba(255, 255, 255, 0.10));
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  margin: 0.25rem;
}
.playlist-picker__empty .ti { font-size: 1.4rem; }

.playlist-picker__footer {
  padding: 0.75rem 1.1rem;
  border-top: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.05));
  display: flex;
  justify-content: center;
}

.playlist-picker__cancel {
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0.4rem 1rem;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  transition: color 0.2s ease;
}
.playlist-picker__cancel:hover {
  color: var(--ds-color-on-surface, #e5e2e1);
}

/* Transição do modal: fade + escala suave */
.playlist-picker-enter-active,
.playlist-picker-leave-active {
  transition: opacity 0.25s ease;
}
.playlist-picker-enter-active .playlist-picker__panel,
.playlist-picker-leave-active .playlist-picker__panel {
  transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.25s ease;
}
.playlist-picker-enter-from,
.playlist-picker-leave-to {
  opacity: 0;
}
.playlist-picker-enter-from .playlist-picker__panel,
.playlist-picker-leave-to .playlist-picker__panel {
  transform: scale(0.94) translateY(0.75rem);
  opacity: 0;
}

/* Toast de feedback */
.playlist-toast {
  position: fixed;
  bottom: calc(var(--ds-dock-height, 4rem) + 1.25rem);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary, #2196f3) 35%, transparent);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface, #e5e2e1);
  font-size: 0.88rem;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
  z-index: 1200;
}
.playlist-toast .ti { color: var(--ds-color-primary, #2196f3); font-size: 1.05rem; }
.playlist-toast-enter-active, .playlist-toast-leave-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.playlist-toast-enter-from, .playlist-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.6rem); }
</style>

