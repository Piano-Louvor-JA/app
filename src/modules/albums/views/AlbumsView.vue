<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMediaStore } from '@modules/media/stores/useMediaStore'

import { GlassCard } from '@design-system/index'
import PalcoRouteSelect from '@modules/settings/components/PalcoRouteSelect.vue'
import type { LibraryAlbum } from '@modules/sync/types/library'
import { getShowCustomCollections, setShowCustomCollections } from '../visibility'
import AlbumCollectionCard from '../components/AlbumCollectionCard.vue'
import {
  createCustomCollection,
  listCustomCollections,
  type CustomCollectionSummary,
} from '@modules/media/services/custom-catalog'
import AlbumHymnalCard from '../components/AlbumHymnalCard.vue'
import AlbumLyricDialog from '../components/AlbumLyricDialog.vue'
import AlbumSearchHitRow from '../components/AlbumSearchHitRow.vue'
import DownloadFailureDialog from '@modules/sync/components/DownloadFailureDialog.vue'
import { useAlbums } from '../composables/useAlbums'
import type { AlbumCategory, AlbumCollection } from '../types/albums'
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  removePlaylistItem,
  savePlaylists,
  type Playlist,
} from '../services/playlist-storage'
import { parsePlaylistsImport, serializePlaylists } from '../services/playlist-io'

const { t } = useI18n()
const router = useRouter()
const mediaStore = useMediaStore()
const playlists = ref<Playlist[]>(listPlaylists())
const newPlaylistName = ref('')
// Visibilidade de Minhas Coletâneas (preferência do usuário, persistida).
const showCustomCollections = ref(getShowCustomCollections())

function toggleCustomCollectionsVisibility(): void {
  const next = !showCustomCollections.value
  setShowCustomCollections(next)
  showCustomCollections.value = next
}


const {
  categories,
  hubSearchQuery,
  hubSearchResults,
  isHubSearching,
  isLoadingCatalog,
  isLoadingMusicIndex,
  lastErrorKey,
  lastActionMessageKey,
  lyricOpen,
  lyricDoc,
  isLoadingLyric,
  isDesktop,
  isDownloadingBatch,
  hasIdleAlbums,
  downloadErrorKey,
  downloadFailure,
  findLibraryAlbum,
  clearError,
  clearActionMessage,
  clearDownloadError,
  hydrateCatalog,
  downloadCollection,
  cancelCollection,
  downloadAll,
  cancelAll,
  removeCollection,
  playSung,
  playInstrumental,
  playSlides,
  openLyric,
  closeLyric,
} = useAlbums()

const busyMusicId = ref<number | null>(null)
const albumPendingRemoval = ref<LibraryAlbum | null>(null)

const showDownloadControls = computed(() => isDesktop)

function isHymnalsCategory(category: AlbumCategory) {
  return String(category.id) === 'hymnals'
}

function isCustomCategory(category: AlbumCategory) {
  return String(category.id) === 'custom'
}

function categoryTitle(category: AlbumCategory) {
  if (isHymnalsCategory(category)) return t('sync.categories.hymnals')
  if (
    category.name === 'CDs Oficiais/Ano' ||
    /cds?\s*oficiais/i.test(category.name)
  ) {
    return t('sync.categories.youthAlbums')
  }
  return category.name
}

function categorySubtitle(category: AlbumCategory) {
  if (isHymnalsCategory(category)) return t('sync.categories.hymnalsSubtitle')
  if (
    category.name === 'CDs Oficiais/Ano' ||
    /cds?\s*oficiais/i.test(category.name)
  ) {
    return t('sync.categories.albumsSubtitle')
  }
  return t('sync.categories.defaultSubtitle')
}

function openCollection(collectionId: string | number) {
  void router.push({
    name: 'albums-collection',
    params: { collectionId: String(collectionId) },
  })
}

function exportPlaylists() {
  if (playlists.value.length === 0) return
  const payload = JSON.stringify(serializePlaylists(playlists.value), null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const today = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `playlists-${today}.json`
  link.click()
  URL.revokeObjectURL(url)
}

const importFeedback = ref('')

/* ---------- Modais (padrão web): Playlists + Minhas Coletâneas ---------- */
const playlistsModalOpen = ref(false)
const customModalOpen = ref(false)
const customCollections = ref<CustomCollectionSummary[]>([])
const isLoadingCustomCollections = ref(false)
const newCustomCollectionName = ref('')

async function hydrateCustomCollections(): Promise<void> {
  if (isLoadingCustomCollections.value) return
  isLoadingCustomCollections.value = true
  try {
    customCollections.value = await listCustomCollections()
  } catch {
    customCollections.value = []
  } finally {
    isLoadingCustomCollections.value = false
  }
}

watch(customModalOpen, (open) => {
  if (open) void hydrateCustomCollections()
})

async function onCreateCustomCollection(): Promise<void> {
  const name = newCustomCollectionName.value.trim()
  if (!name) return
  const created = await createCustomCollection(name)
  newCustomCollectionName.value = ''
  if (created) {
    await hydrateCatalog()
    await hydrateCustomCollections()
  }
}

function showImportFeedback(message: string) {
  importFeedback.value = message
  setTimeout(() => {
    importFeedback.value = ''
  }, 3200)
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void file.text().then((raw) => {
    const result = parsePlaylistsImport(raw)
    if (!result.ok) {
      showImportFeedback('Arquivo de playlists inválido.')
      return
    }
    // Merge por nome: playlist nova entra; existente ganha só faixas novas.
    const current = listPlaylists()
    const byName = new Map(current.map((p) => [p.name.toLowerCase(), p]))
    let addedTracks = 0
    let newLists = 0
    for (const imported of result.playlists) {
      const existing = byName.get(imported.name.toLowerCase())
      if (!existing) {
        current.push(imported)
        byName.set(imported.name.toLowerCase(), imported)
        newLists += 1
        addedTracks += imported.items.length
        continue
      }
      for (const item of imported.items) {
        const dup = existing.items.some((i) => i.musicId === item.musicId && i.albumId === item.albumId)
        if (!dup) {
          existing.items.push(item)
          addedTracks += 1
        }
      }
    }
    savePlaylists(current)
    playlists.value = listPlaylists()
    const parts = []
    if (newLists > 0) parts.push(`${newLists} playlist(s) nova(s)`)
    if (addedTracks > 0) parts.push(`${addedTracks} faixa(s) adicionada(s)`)
    showImportFeedback(parts.length > 0 ? `Importado: ${parts.join(', ')}.` : 'Nada novo para importar.')
  })
}

async function playPlaylist(playlist: Playlist) {
  if (playlist.items.length === 0) return
  await mediaStore.playQueue(playlist.items, 0)
  await router.push({ name: 'media' })
}

function addPlaylist() {
  const name = newPlaylistName.value.trim()
  if (!name) return
  createPlaylist(name)
  playlists.value = listPlaylists()
  newPlaylistName.value = ''
}

function removePlaylist(id: string) {
  deletePlaylist(id)
  playlists.value = listPlaylists()
}

function removePlaylistTrack(id: string, index: number) {
  removePlaylistItem(id, index)
  playlists.value = listPlaylists()
}

const expandedPlaylistId = ref<string | null>(null)

function togglePlaylist(id: string) {
  expandedPlaylistId.value = expandedPlaylistId.value === id ? null : id
}

function retry() {
  clearError()
  void hydrateCatalog()
}

function clearHubSearch() {
  hubSearchQuery.value = ''
}

function requestRemove(collection: AlbumCollection) {
  const album = findLibraryAlbum(collection.id)
  if (!album) return
  albumPendingRemoval.value = album
}

function dismissRemove() {
  albumPendingRemoval.value = null
}

async function confirmRemove() {
  const album = albumPendingRemoval.value
  if (!album) return
  albumPendingRemoval.value = null
  await removeCollection(album.id)
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
  <section class="albums-view">
    <header class="albums-view__header">
      <div class="albums-view__brand">
        <div class="albums-view__icon">
          <i
            class="ti ti-music"
            aria-hidden="true"
          />
        </div>
        <div class="albums-view__headings">
          <h1 class="albums-view__title">
            {{ t('albums.title') }}
          </h1>
          <p class="albums-view__subtitle">
            {{ t('albums.subtitle') }}
          </p>
        </div>
      </div>

      <div class="albums-view__header-actions">
        <PalcoRouteSelect module="hymns" compact />
        <button
          type="button"
          class="albums-view__toolbar-btn"
          :aria-label="t('albums.playlists.title')"
          @click="playlistsModalOpen = true"
        >
          <i class="ti ti-playlist" aria-hidden="true" />
          {{ t('albums.playlists.title') }}
          <span
            v-if="playlists.length > 0"
            class="albums-view__toolbar-count"
          >{{ playlists.length }}</span>
        </button>
        <button
          v-if="showCustomCollections"
          type="button"
          class="albums-view__toolbar-btn"
          :aria-label="t('albums.custom.title')"
          @click="customModalOpen = true"
        >
          <i class="ti ti-folder" aria-hidden="true" />
          {{ t('albums.custom.title') }}
          <span
            v-if="customCollections.length > 0"
            class="albums-view__toolbar-count"
          >{{ customCollections.length }}</span>
        </button>
        <button
          type="button"
          class="albums-view__toolbar-btn"
          :aria-label="showCustomCollections ? t('albums.custom.hide') : t('albums.custom.show')"
          :title="showCustomCollections ? t('albums.custom.hide') : t('albums.custom.show')"
          @click="toggleCustomCollectionsVisibility"
        >
          <i
            class="ti"
            :class="showCustomCollections ? 'ti-eye' : 'ti-eye-off'"
            aria-hidden="true"
          />
        </button>
        <button
          v-if="showDownloadControls && categories.length > 0 && !isDownloadingBatch"
          type="button"
          class="albums-view__batch-btn"
          :disabled="!hasIdleAlbums"
          @click="downloadAll"
        >
          <i
            class="ti ti-cloud-download"
            aria-hidden="true"
          />
          {{ t('sync.downloadAll') }}
        </button>
        <button
          v-else-if="showDownloadControls && isDownloadingBatch"
          type="button"
          class="albums-view__batch-btn albums-view__batch-btn--cancel"
          @click="cancelAll"
        >
          <i
            class="ti ti-circles-relation"
            aria-hidden="true"
          />
          {{ t('sync.cancelAll') }}
        </button>

        <label class="albums-view__search">
          <i
            class="ti ti-search"
            aria-hidden="true"
          />
          <input
            v-model="hubSearchQuery"
            type="search"
            :placeholder="t('albums.hubSearchPlaceholder')"
            :aria-label="t('albums.hubSearchPlaceholder')"
          >
          <button
            v-if="isHubSearching"
            type="button"
            class="albums-view__search-clear"
            :aria-label="t('albums.clearSearch')"
            :title="t('albums.clearSearch')"
            @click="clearHubSearch"
          >
            <i
              class="ti ti-x"
              aria-hidden="true"
            />
          </button>
        </label>
      </div>
    </header>

    <div
      v-if="downloadErrorKey && !downloadFailure"
      class="albums-view__alert"
      role="alert"
    >
      <p>{{ t(downloadErrorKey) }}</p>
      <button
        type="button"
        @click="clearDownloadError"
      >
        {{ t('albums.dismiss') }}
      </button>
    </div>

    <div
      v-if="lastActionMessageKey && !lastActionMessageKey.startsWith('media.messages.')"
      class="albums-view__alert"
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
      v-if="lastErrorKey && !isHubSearching"
      class="albums-view__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <button
        type="button"
        @click="retry"
      >
        {{ t('albums.retry') }}
      </button>
    </div>

    <!-- Modal: Playlists (Teleport pro body, padrão web) -->
    <Teleport to="body">
      <div
        v-if="playlistsModalOpen"
        class="albums-view__modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('albums.playlists.title')"
      >
        <div
          class="albums-view__modal-backdrop"
          aria-hidden="true"
          @click="playlistsModalOpen = false"
        />
        <GlassCard class="albums-view__modal-panel">
          <header class="albums-view__playlists-header">
            <div class="albums-view__playlists-heading">
              <i class="ti ti-playlist" aria-hidden="true" />
              <h2 id="playlists-title">{{ t('albums.playlists.title') }}</h2>
            </div>
            <button
              type="button"
              class="albums-view__playlists-io"
              :aria-label="t('albums.lyric.close')"
              @click="playlistsModalOpen = false"
            >
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>
          <form class="albums-view__modal-form" @submit.prevent="addPlaylist">
            <input v-model="newPlaylistName" required :placeholder="t('albums.playlists.newPlaceholder')" :aria-label="t('albums.playlists.newPlaceholder')">
            <button type="submit"><i class="ti ti-plus" aria-hidden="true" /> {{ t('albums.playlists.create') }}</button>
            <button
              type="button"
              class="albums-view__playlists-io"
              :disabled="playlists.length === 0"
              :aria-label="t('albums.playlists.export')"
              :title="t('albums.playlists.export')"
              @click="exportPlaylists"
            >
              <i class="ti ti-upload" aria-hidden="true" />
            </button>
            <label class="albums-view__playlists-io" :aria-label="t('albums.playlists.import')" :title="t('albums.playlists.import')">
              <i class="ti ti-download" aria-hidden="true" />
              <input type="file" accept="application/json,.json" hidden @change="onImportFile">
            </label>
          </form>
          <p v-if="importFeedback" class="albums-view__playlists-feedback" role="status" aria-live="polite">
            {{ importFeedback }}
          </p>

          <div v-if="playlists.length === 0" class="albums-view__state">
            <i class="ti ti-music-plus" aria-hidden="true" />
            {{ t('albums.playlists.empty') }}
          </div>

          <TransitionGroup v-else name="playlist-card" tag="div" class="albums-view__playlist-list">
            <article v-for="playlist in playlists" :key="playlist.id" class="albums-view__playlist" :class="{ 'albums-view__playlist--open': expandedPlaylistId === playlist.id }">
              <div class="albums-view__playlist-row">
                <button
                  type="button"
                  class="albums-view__playlist-toggle"
                  :aria-expanded="expandedPlaylistId === playlist.id"
                  @click="togglePlaylist(playlist.id)"
                >
                  <span class="albums-view__playlist-icon">
                    <i
                      class="ti"
                      :class="playlist.items.length > 0 ? 'ti-playlist' : 'ti-music-off'"
                      aria-hidden="true"
                    />
                  </span>
                  <span class="albums-view__playlist-name">
                    <strong>{{ playlist.name }}</strong>
                    <small>{{ playlist.items.length }} faixa(s)</small>
                  </span>
                  <i
                    class="ti albums-view__playlist-chevron"
                    :class="expandedPlaylistId === playlist.id ? 'ti-chevron-down' : 'ti-chevron-right'"
                    aria-hidden="true"
                  />
                </button>
                <div class="albums-view__playlist-actions">
                  <button
                    type="button"
                    class="albums-view__playlist-play"
                    :disabled="playlist.items.length === 0"
                    :aria-label="`Tocar ${playlist.name}`"
                    @click="playPlaylist(playlist)"
                  >
                    <i class="ti ti-player-play" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="albums-view__playlist-remove"
                    :aria-label="`Remover playlist ${playlist.name}`"
                    @click="removePlaylist(playlist.id)"
                  >
                    <i class="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Transition name="playlist-tracks">
                <ul v-if="expandedPlaylistId === playlist.id && playlist.items.length > 0" class="albums-view__playlist-tracks">
                  <li v-for="(item, index) in playlist.items" :key="`${item.musicId}-${index}`">
                    <span class="albums-view__playlist-track-index">{{ index + 1 }}</span>
                    <span class="albums-view__playlist-track-title">{{ item.title }}</span>
                    <button
                      type="button"
                      class="albums-view__playlist-track-remove"
                      :aria-label="`Remover ${item.title} da playlist`"
                      @click="removePlaylistTrack(playlist.id, index)"
                    >
                      <i class="ti ti-x" aria-hidden="true" />
                    </button>
                  </li>
                </ul>
              </Transition>
            </article>
          </TransitionGroup>
        </GlassCard>
      </div>
    </Teleport>



    <!-- Modal: Minhas Coletâneas (oculto enquanto SHOW_CUSTOM_COLLECTIONS=false) -->
    <Teleport to="body">
      <div
        v-if="showCustomCollections && customModalOpen"
        class="albums-view__modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('albums.custom.title')"
      >
        <div
          class="albums-view__modal-backdrop"
          aria-hidden="true"
          @click="customModalOpen = false"
        />
        <GlassCard class="albums-view__modal-panel">
          <header class="albums-view__playlists-header">
            <div class="albums-view__playlists-heading">
              <i class="ti ti-folder" aria-hidden="true" />
              <h2>{{ t('albums.custom.title') }}</h2>
            </div>
            <button
              type="button"
              class="albums-view__playlists-io"
              :aria-label="t('albums.lyric.close')"
              @click="customModalOpen = false"
            >
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>

          <!-- A lista de coletâneas vive na própria página (cards) — o modal
               é só criação rápida + atalhos, sem duplicar a lista. -->
          <form class="albums-view__modal-form" @submit.prevent="onCreateCustomCollection">
            <input
              v-model="newCustomCollectionName"
              required
              :placeholder="t('albums.custom.newPlaceholder')"
              :aria-label="t('albums.custom.newPlaceholder')"
            >
            <button type="submit">
              <i class="ti ti-plus" aria-hidden="true" /> {{ t('albums.custom.create') }}
            </button>
          </form>

          <footer class="albums-view__modal-footer">
            <button
              type="button"
              class="albums-view__editor-btn"
              :aria-label="t('albums.custom.openEditor')"
              :title="t('albums.custom.openEditor')"
              @click="router.push('/media/editor')"
            >
              <i class="ti ti-pencil" aria-hidden="true" />
              {{ t('albums.custom.openEditor') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Teleport>

    <template v-if="isHubSearching">
      <GlassCard
        class="albums-view__results-card"
        :padding="false"
        elevated
      >
        <div class="albums-view__results-head">
          <h2 class="albums-view__results-title">
            {{ t('albums.searchResultsTitle') }}
          </h2>
        </div>

        <div
          v-if="isLoadingMusicIndex"
          class="albums-view__state albums-view__state--inset"
        >
          {{ t('albums.loading') }}
        </div>

        <div
          v-else-if="hubSearchResults.length === 0"
          class="albums-view__state albums-view__state--inset"
        >
          {{ t('albums.messages.searchEmpty') }}
        </div>

        <div
          v-else
          class="albums-view__results-list"
        >
          <AlbumSearchHitRow
            v-for="hit in hubSearchResults"
            :key="hit.musicId"
            :hit="hit"
            :busy="busyMusicId === hit.musicId"
            @sung="runAction(hit.musicId, () => playSung(hit.musicId))"
            @instrumental="
              runAction(hit.musicId, () => playInstrumental(hit.musicId))
            "
            @slides="runAction(hit.musicId, () => playSlides(hit.musicId))"
            @lyric="runAction(hit.musicId, () => openLyric(hit.musicId))"
          />
        </div>
      </GlassCard>
    </template>

    <div
      v-if="isLoadingCatalog && categories.length === 0"
      class="albums-view__state"
    >
      {{ t('albums.loading') }}
    </div>

    <div
      v-else-if="!isLoadingCatalog && categories.length === 0 && !isHubSearching"
      class="albums-view__state"
    >
      {{ t('albums.messages.catalogEmpty') }}
    </div>

    <div
      v-if="categories.length > 0 && !isHubSearching"
      class="albums-view__body"
    >
      <section
        v-for="category in categories"
        :key="String(category.id)"
        class="albums-view__category"
        :class="{
          'albums-view__category--hymnals': isHymnalsCategory(category),
        }"
      >
        <header class="albums-view__category-header">
          <div>
            <h2 class="albums-view__category-title">
              {{ categoryTitle(category) }}
            </h2>
            <p class="albums-view__category-subtitle">
              {{ categorySubtitle(category) }}
            </p>
          </div>
          <button
            v-if="showCustomCollections && isCustomCategory(category)"
            type="button"
            class="albums-view__editor-btn"
            @click="router.push('/media/editor')"
          >
            <i
              class="ti ti-pencil"
              aria-hidden="true"
            />
            {{ t('albums.custom.openEditor') }}
          </button>
        </header>

        <div
          v-if="isHymnalsCategory(category)"
          class="albums-view__hymnal-grid"
        >
          <AlbumHymnalCard
            v-for="collection in category.collections"
            :key="String(collection.id)"
            :collection="collection"
            :library-album="findLibraryAlbum(collection.id)"
            :show-download-controls="showDownloadControls"
            @open="openCollection(collection.id)"
            @download="downloadCollection(collection.id)"
            @cancel="cancelCollection(collection.id)"
            @remove="requestRemove(collection)"
          />
        </div>

        <GlassCard
          v-else
          class="albums-view__grid-wrap"
          :padding="false"
          elevated
        >
          <div class="albums-view__grid">
            <AlbumCollectionCard
              v-for="collection in category.collections"
              :key="String(collection.id)"
              :collection="collection"
              :library-album="findLibraryAlbum(collection.id)"
              :show-download-controls="showDownloadControls"
              @open="openCollection(collection.id)"
              @download="downloadCollection(collection.id)"
              @cancel="cancelCollection(collection.id)"
              @remove="requestRemove(collection)"
            />
          </div>
        </GlassCard>
      </section>
    </div>

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />

    <DownloadFailureDialog
      :failure="downloadFailure"
      @close="clearDownloadError"
    />

    <Teleport to="body">
      <div
        v-if="albumPendingRemoval"
        class="albums-confirm"
        role="dialog"
        aria-modal="true"
        :aria-label="t('sync.deleteConfirmTitle')"
      >
        <div
          class="albums-confirm__backdrop"
          aria-hidden="true"
        />
        <div class="albums-confirm__panel">
          <h2 class="albums-confirm__title">
            {{ t('sync.deleteConfirmTitle') }}
          </h2>
          <p class="albums-confirm__text">
            {{
              t('sync.deleteConfirmText', {
                name: albumPendingRemoval.name,
              })
            }}
          </p>
          <div class="albums-confirm__actions">
            <button
              type="button"
              class="albums-confirm__btn"
              @click="dismissRemove"
            >
              {{ t('sync.deleteConfirmNo') }}
            </button>
            <button
              type="button"
              class="albums-confirm__btn albums-confirm__btn--danger"
              @click="confirmRemove"
            >
              {{ t('sync.deleteConfirmYes') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
.albums-view {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-sizing: border-box;
  min-height: 0;
  padding: 0.75rem var(--ds-spacing-page, 2rem) 1rem;
  overflow: hidden;
  container-type: inline-size;
  container-name: albums-view;
}

.albums-view__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.albums-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.albums-view__icon {
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
    font-size: 1.4rem;
  }
}

.albums-view__headings {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}

.albums-view__title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.15;
}

.albums-view__subtitle {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ds-color-primary);
}

.albums-view__header-actions {
  display: flex;
  flex-shrink: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  max-width: 100%;
}

.albums-view__search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: 14rem;
  max-width: 100%;
  min-width: 0;
  flex-shrink: 1;
  box-sizing: border-box;
  padding: 0.55rem 0.9rem;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 82%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  color: var(--ds-color-on-surface-variant);

  .ti-search {
    flex-shrink: 0;
    color: var(--ds-color-primary);
    font-size: 1.15rem;
  }

  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-size: 0.9rem;
  }
}

.albums-view__search-clear {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  }
}

.albums-view__batch-btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  height: 2.5rem;
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #003258);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  box-shadow: 0 0 20px color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  transition:
    filter 200ms ease,
    opacity 200ms ease,
    background-color 200ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    box-shadow: none;
  }

  &--cancel {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 85%, transparent);
    color: #fff;
    box-shadow: none;
  }
}

.albums-view__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-right: 0.25rem;
}

.albums-view__category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.albums-view__modal-footer--split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.albums-view__rules-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0.25rem 0;
  color: inherit;
  opacity: 0.65;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.albums-view__rules-link:hover {
  opacity: 1;
}

.albums-view__rules-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 420px;
  width: 100%;
}

.albums-view__rules-ok {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.3));
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.albums-view__rules-ok:hover {
  background: rgba(255, 255, 255, 0.18);
}

.albums-view__toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;

  .ti {
    color: var(--ds-color-primary);
    font-size: 1.05rem;
  }

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}

.albums-view__toolbar-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.72rem;
  font-weight: 700;
}

/* --- Modais (Teleport > body) --- */
.albums-view__modal {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.albums-view__modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
}

.albums-view__modal-panel {
  position: relative;
  width: min(40rem, 100%);
  max-height: min(75vh, 42rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem !important;
}

.albums-view__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.albums-view__modal-form {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;

  input {
    flex: 1 1 10rem;
    min-width: 10rem;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--ds-color-outline-strong);
    border-radius: var(--ds-radius-sm, 8px 0 8px 0);
    background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 80%, transparent);
    color: var(--ds-color-on-surface);
    font: inherit;
    font-size: 0.88rem;
    transition: border-color 0.2s ease;

    &:focus {
      outline: none;
      border-color: var(--ds-color-primary);
    }
  }

  button[type='submit'] {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0.9rem;
    border: 0;
    border-radius: var(--ds-radius-sm, 8px 0 8px 0);
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #fff);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.2s ease;

    &:hover {
      filter: brightness(1.1);
    }
  }
}

.albums-view__modal-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.06));
}

.albums-view__custom-editor-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 120ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  }
}

.albums-view__editor-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--ds-color-outline-strong, rgba(255, 255, 255, 0.1));
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card, #242424) 70%, transparent);
  color: var(--ds-color-on-surface, #e5e2e1);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;

  &:hover {
    border-color: var(--ds-color-primary, #2196f3);
    color: var(--ds-color-primary, #2196f3);
  }
}

.albums-view__category-title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--ds-color-on-surface);
}

.albums-view__category-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.85;
}

.albums-view__hymnal-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.albums-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 1rem;
  padding: 1rem;
}

.albums-view__results-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.albums-view__results-head {
  flex-shrink: 0;
  padding: 0.9rem 1rem 0.55rem;
  border-bottom: 1px solid var(--ds-color-outline);
}

.albums-view__results-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ds-color-on-surface);
}

.albums-view__results-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.albums-view__state,
.albums-view__alert {
  flex: 1;
  min-height: 0;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 72%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  padding: 1.5rem;
  color: var(--ds-color-on-surface-variant);
}

.albums-view__state--inset {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
}

.albums-view__alert {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  button {
    border: 1px solid var(--ds-color-outline-strong);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    cursor: pointer;
  }
}

.albums-confirm {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.albums-confirm__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(0 0 0 / 45%);
}

.albums-confirm__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 26rem;
  padding: 1.5rem;
  border-radius: var(--ds-radius-lg, 0.75rem 0 0.75rem 0);
  border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 8%));
  background: var(--ds-color-surface-elevated, #1e1e1e);
  box-shadow: 0 24px 48px rgb(0 0 0 / 40%);
}

.albums-confirm__title {
  margin: 0 0 0.75rem;
  color: var(--ds-color-on-surface);
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

.albums-confirm__text {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
}

.albums-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.albums-confirm__btn {
  height: 2.25rem;
  padding: 0 1rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 200ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  }

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
    color: var(--ds-color-error, #ffb4ab);

    &:hover {
      background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 28%, transparent);
    }
  }
}

.albums-view__playlists {
  flex-shrink: 0;
  overflow: hidden;
}

.albums-view__playlists-inner {
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.albums-view__playlists-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.albums-view__playlists-heading {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.albums-view__playlists-heading .ti { color: var(--ds-color-primary); font-size: 1.15rem; }
.albums-view__playlists-heading h2 { margin: 0; font-size: 1.05rem; letter-spacing: -0.01em; }

.albums-view__playlists form {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}

.albums-view__playlists input {
  min-width: 16rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-surface-container, #201f1f) 80%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  transition: border-color 0.2s ease;
}
.albums-view__playlists input:focus {
  outline: none;
  border-color: var(--ds-color-primary);
}
.albums-view__playlists form button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.9rem;
  border: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #fff);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.2s ease;
}
.albums-view__playlists form button:hover { filter: brightness(1.1); }

.albums-view__playlists .albums-view__state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.9rem;
  border: 1px dashed var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
}
.albums-view__playlists .albums-view__state .ti { font-size: 1.1rem; }

.albums-view__playlist-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.albums-view__playlist {
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-surface-container, #201f1f) 70%, transparent);
  transition: border-color 0.2s ease, background 0.2s ease;
  overflow: hidden;
}
.albums-view__playlist--open {
  border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface-container-high, #2a2a2a) 75%, transparent);
}

.albums-view__playlist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
}

.albums-view__playlist-toggle {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
  min-width: 0;
}

.albums-view__playlist-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  font-size: 1rem;
}

.albums-view__playlist-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.albums-view__playlist-name strong {
  font-size: 0.92rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.albums-view__playlist-name small {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.76rem;
}

.albums-view__playlist-chevron {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.9rem;
  transition: transform 0.2s ease;
}
.albums-view__playlist--open .albums-view__playlist-chevron { color: var(--ds-color-primary); }

.albums-view__playlist-actions { display: inline-flex; gap: 0.4rem; align-items: center; flex-shrink: 0; }

.albums-view__playlist-play,
.albums-view__playlist-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.albums-view__playlist-play {
  color: var(--ds-color-primary);
  border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
}
.albums-view__playlist-play:hover:not(:disabled) {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #fff);
}
.albums-view__playlist-play:disabled { opacity: 0.35; cursor: not-allowed; }
.albums-view__playlist-remove { color: var(--ds-color-on-surface-variant); }
.albums-view__playlist-remove:hover {
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.45);
}

.albums-view__playlist-tracks {
  margin: 0 0.75rem 0.7rem 3.65rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.albums-view__playlist-tracks li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.1rem;
  font-size: 0.85rem;
  border-top: 1px solid var(--ds-color-outline);
}
.albums-view__playlist-tracks li:first-child { border-top: 0; }

.albums-view__playlist-track-index {
  width: 1.4rem;
  text-align: right;
  color: var(--ds-color-primary-soft, var(--ds-color-primary));
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  flex-shrink: 0;
}
.albums-view__playlist-track-title {
  flex: 1;
  color: var(--ds-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.albums-view__playlist-track-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 0.4rem;
  opacity: 0.55;
  transition: all 0.2s ease;
}
.albums-view__playlist-track-remove:hover { color: #ff6b6b; opacity: 1; }

.playlist-card-enter-active, .playlist-card-leave-active { transition: all 0.25s ease; }
.playlist-card-enter-from, .playlist-card-leave-to { opacity: 0; transform: translateY(-0.4rem); }

.playlist-tracks-enter-active, .playlist-tracks-leave-active { transition: opacity 0.2s ease; }
.playlist-tracks-enter-from, .playlist-tracks-leave-to { opacity: 0; }

@media (max-width: 1280px) {
  .albums-view {
    gap: 0.85rem;
    padding: 0.5rem 1rem 0.65rem;
  }

  .albums-view__header {
    gap: 0.75rem;
  }

  .albums-view__brand {
    gap: 0.65rem;
  }

  .albums-view__icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .albums-view__title {
    font-size: 1.15rem;
  }

  .albums-view__subtitle {
    font-size: 0.85rem;
  }

  .albums-view__body {
    gap: 1.15rem;
  }

  .albums-view__category-header {
    margin-bottom: 0.65rem;
  }

  .albums-view__category-title {
    font-size: 1.05rem;
  }

  .albums-view__hymnal-grid {
    gap: 0.85rem;
  }

  .albums-view__grid {
    gap: 0.75rem;
    padding: 0.75rem;
  }
}
.albums-view__playlists-io {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}
.albums-view__playlists-io:hover:not(:disabled) {
  color: var(--ds-color-primary);
  border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
}
.albums-view__playlists-io:disabled { opacity: 0.35; cursor: not-allowed; }
.albums-view__playlists-feedback {
  flex-basis: 100%;
  margin: 0;
  color: var(--ds-color-primary-soft, var(--ds-color-primary));
  font-size: 0.82rem;
}
</style>

