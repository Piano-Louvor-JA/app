<script setup lang="ts">
import PlaylistPicker from '../components/PlaylistPicker.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { MediaCollectionList } from '@design-system/index'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'
import { useProgressiveList } from '@shared/composables/useProgressiveList'

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

const selectedSearchIndex = ref(0)
watch(filteredTracks, () => { selectedSearchIndex.value = 0 })
async function onCollectionSearchKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || !renderedTracks.value.length) return
  if ((event.target as HTMLElement)?.closest('button')) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Enter') {
    const track = renderedTracks.value[selectedSearchIndex.value]
    if (track) await runAction(track.musicId, () => playSung(track.musicId))
    return
  }
  selectedSearchIndex.value = Math.max(0, Math.min(renderedTracks.value.length - 1,
    selectedSearchIndex.value + (event.key === 'ArrowDown' ? 1 : -1)))
  await nextTick()
  document.getElementById(`collection-search-result-${renderedTracks.value[selectedSearchIndex.value]?.musicId}`)?.scrollIntoView?.({ block: 'nearest' })
}

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

// Hinário: 610 hinos — desenhar tudo de uma vez travava a tela por ~1,7 s
const { visible: renderedTracks } = useProgressiveList(filteredTracks)
const collectionList = ref<{ $el: HTMLElement } | null>(null)
let focusedCollectionId: string | null = null
watch([collectionId, () => renderedTracks.value.length > 0], async ([id, hasTracks]) => {
  if (!hasTracks || focusedCollectionId === id) return
  await nextTick()
  const input = collectionList.value?.$el.querySelector<HTMLInputElement>('input[type="search"]')
  if (input) {
    input.focus({ preventScroll: true })
    focusedCollectionId = id
  }
}, { immediate: true, flush: 'post' })


const title = computed(
  () => activeCollection.value?.name || t('albums.collectionFallback'),
)

/** Retrato guardado ao minimizar (coletânea + busca). */
interface CollectionSnapshot {
  collectionId: string
  searchQuery: string
}

const { minimize, prepare, takeRestoredState } = useMinimizablePage<CollectionSnapshot>({
  describe: () => {
    const query = searchQuery.value.trim()
    const parts = [
      query ? t('minimize.search', { q: query }) : '',
      t('albums.trackCount', { count: filteredTracks.value.length }),
    ]
    return {
      title: title.value,
      icon: activeCollection.value?.kind === 'hymnal' ? 'ti-book' : 'ti-disc',
      summary: parts.filter(Boolean).join(' · '),
    }
  },
  capture: () => ({ collectionId: collectionId.value, searchQuery: searchQuery.value }),
  fallbackRoute: { name: 'albums' },
})

async function load() {
  clearError()
  await openCollection(collectionId.value)
  // Reaberta pela barra de minimizadas: a busca volta depois de carregar
  // (abrir outra coletânea no meio-tempo limpava a busca na store).
  const restored = takeRestoredState()
  if (restored?.collectionId === collectionId.value) searchQuery.value = restored.searchQuery
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
  /* v8 ignore start -- picker só emite ids presentes em playlists.value */
  if (result?.added) {
    showPlaylistFeedback(`“${item.title}” adicionada a “${target?.name ?? 'playlist'}”`)
  } else {
    showPlaylistFeedback(`“${item.title}” já está em “${target?.name ?? 'playlist'}”`)
  }
  /* v8 ignore stop */
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
        <PageBackStack @minimize="minimize" @prepare="prepare">
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
        </PageBackStack>

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

      <div v-if="activeCollection && filteredTracks.length > 0"
        class="album-collection-view__playback-actions">
        <button type="button" class="album-collection-view__shuffle"
          :aria-label="t('albums.playlists.shuffle')" :title="t('albums.playlists.shuffleHint')"
          @click="playAllInActiveCollection('audio', true)">
          <i class="ti ti-arrows-shuffle" aria-hidden="true" />
        </button>
        <button type="button" class="album-collection-view__play-all"
          :aria-label="t('albums.playAll')" :title="t('albums.playlists.playAllHint')"
          @click="playAllInActiveCollection()">
          <i class="ti ti-player-play" aria-hidden="true" />
        </button>
      </div>
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

    <p v-if="activeCollection?.kind === 'hymnal'" class="album-collection-view__search-explanation">
      {{ t('albums.searchExplanation') }}
    </p>

    <MediaCollectionList
      ref="collectionList"
      v-model="searchQuery"
      @keydown.capture="onCollectionSearchKeydown"
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
        v-for="(track, index) in renderedTracks"
        :key="track.musicId"
        :track="track"
        :id="`collection-search-result-${track.musicId}`"
        :selected="index === selectedSearchIndex"
        @focus="selectedSearchIndex = index"
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

    <PlaylistPicker :playlist-item="playlistItem" :playlists="playlists" @close="closePlaylistPicker" @choose="addToPlaylist" />

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />
  </section>
</template>

<style scoped lang="scss">
.album-collection-view__search-explanation {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: .8rem;
  line-height: 1.4;
}

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

.album-collection-view__playback-actions {
  display: inline-flex;
  gap: 0.4rem;
  margin-left: auto;
}
.album-collection-view__play-all,
.album-collection-view__shuffle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-primary);
  font-size: 0.95rem;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.album-collection-view__play-all:hover,
.album-collection-view__shuffle:hover {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
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

