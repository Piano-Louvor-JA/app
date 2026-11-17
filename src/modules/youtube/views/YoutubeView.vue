<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AppConfirm from '@shared/components/AppConfirm.vue'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'
import type { YoutubeSearchContinuation, YoutubeSearchItem } from '@shared/types/desktop-bridge'

import {
  clearYoutubeHistory,
  filterYoutubeHistory,
  forgetYoutubeQuery,
  listYoutubeFavorites,
  listYoutubeHistory,
  listYoutubeRecentQueries,
  recordYoutubePlay,
  rememberYoutubeQuery,
  removeYoutubeFavorite,
  removeYoutubeHistoryEntry,
  toggleYoutubeFavorite,
  type YoutubeFavoriteEntry,
  type YoutubeHistoryEntry,
} from '../services/youtube-history'
import {
  fetchYoutubeVideoMeta,
  isYoutubeSearchAvailable,
  playYoutubeVideo,
  searchYoutubeVideos,
  searchYoutubeVideosMore,
  youtubeIdFromText,
} from '../services/youtube-player'
import {
  addVideosToYoutubeCollection,
  addVideoToYoutubeCollection,
  collectionHasVideo,
  createYoutubeCollection,
  deleteYoutubeCollection,
  listYoutubeCollections,
  moveVideoInYoutubeCollection,
  removeVideoFromYoutubeCollection,
  renameYoutubeCollection,
  type YoutubeCollection,
} from '../services/youtube-collections'
import YoutubeDownloadButton from '../components/YoutubeDownloadButton.vue'
import YoutubeDownloadDialog from '../components/YoutubeDownloadDialog.vue'
import YoutubeStorageChip from '../components/YoutubeStorageChip.vue'
import YoutubePlaylistImportDialog from '../components/YoutubePlaylistImportDialog.vue'
import { isDownloading, useYoutubeDownloads } from '../composables/useYoutubeDownloads'

type Tab = 'search' | 'history' | 'favorites' | 'collections'
type PlayableVideo = Pick<YoutubeSearchItem, 'videoId' | 'title'> &
  Partial<Pick<YoutubeSearchItem, 'channel' | 'thumbnail' | 'durationText'>>

const { t } = useI18n()
const router = useRouter()

const tab = ref<Tab>('search')
const available = isYoutubeSearchAvailable()

/* ---------- Busca ---------- */
const query = ref('')
const lastQuery = ref('')
const results = ref<YoutubeSearchItem[]>([])
const continuation = ref<YoutubeSearchContinuation | null>(null)
const searching = ref(false)
const loadingMore = ref(false)
const searchError = ref(false)
const recentQueries = ref<string[]>(listYoutubeRecentQueries())
let searchSeq = 0

/** A primeira página do YouTube traz ~20 vídeos; a busca já completa até este total. */
const INITIAL_TARGET = 60
const MAX_INITIAL_PAGES = 4

async function runSearch(text = query.value) {
  const q = text.trim()
  if (!q) return
  query.value = q
  tab.value = 'search'

  // Link colado: toca direto, sem buscar.
  const pastedId = youtubeIdFromText(q)
  if (pastedId) {
    const meta = await fetchYoutubeVideoMeta(pastedId)
    await play({ videoId: pastedId, title: meta?.title || q, channel: meta?.channel ?? '' }, false)
    return
  }

  const seq = ++searchSeq
  searching.value = true
  searchError.value = false
  lastQuery.value = q
  recentQueries.value = rememberYoutubeQuery(q)
  try {
    const result = await searchYoutubeVideos(q)
    if (seq !== searchSeq) return
    results.value = result.items
    continuation.value = result.continuation
    searchError.value = Boolean(result.error) && result.items.length === 0
    // Mostra a primeira leva já e completa com as próximas páginas em seguida.
    searching.value = false
    loadingMore.value = true
    try {
      for (let page = 0; page < MAX_INITIAL_PAGES && continuation.value && results.value.length < INITIAL_TARGET; page++) {
        if (!(await fetchNextPage(seq))) break
      }
    } finally {
      if (seq === searchSeq) loadingMore.value = false
    }
  } catch {
    if (seq !== searchSeq) return
    results.value = []
    continuation.value = null
    searchError.value = true
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

/** Busca a próxima página e junta à lista; false quando não veio nada novo. */
async function fetchNextPage(seq: number): Promise<boolean> {
  if (!continuation.value) return false
  try {
    const result = await searchYoutubeVideosMore(continuation.value)
    if (seq !== searchSeq) return false
    const known = new Set(results.value.map((item) => item.videoId))
    const fresh = result.items.filter((item) => !known.has(item.videoId))
    results.value = [...results.value, ...fresh]
    continuation.value = result.items.length > 0 ? result.continuation : null
    return fresh.length > 0
  } catch {
    if (seq === searchSeq) continuation.value = null
    return false
  }
}

async function loadMore() {
  if (!continuation.value || loadingMore.value || searching.value) return
  const seq = searchSeq
  loadingMore.value = true
  try {
    // Duas páginas por vez (~40 vídeos).
    if (await fetchNextPage(seq)) await fetchNextPage(seq)
  } finally {
    loadingMore.value = false
  }
}

/* Rolagem infinita: ao chegar perto do fim da lista, carrega mais sozinho. */
const moreSentinel = ref<HTMLElement | null>(null)
let moreObserver: IntersectionObserver | null = null
watch(moreSentinel, (el) => {
  moreObserver?.disconnect()
  moreObserver = null
  if (!el || typeof IntersectionObserver === 'undefined') return
  moreObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMore()
  }, { rootMargin: '0px 0px 600px 0px' })
  moreObserver.observe(el)
})
onBeforeUnmount(() => moreObserver?.disconnect())

function forgetQuery(q: string) {
  recentQueries.value = forgetYoutubeQuery(q)
}

/* ---------- Histórico ---------- */
const history = ref<YoutubeHistoryEntry[]>(listYoutubeHistory())
const historyFilter = ref('')

/* ---------- Favoritos ---------- */
const favorites = ref<YoutubeFavoriteEntry[]>(listYoutubeFavorites())
const favoriteIds = computed(() => new Set(favorites.value.map((entry) => entry.videoId)))

function isFavorite(videoId: string): boolean {
  return favoriteIds.value.has(videoId)
}

function toggleFavorite(video: PlayableVideo) {
  favorites.value = toggleYoutubeFavorite(video)
}

/** Linhas da aba atual (Histórico ou Favoritos), já filtradas. */
type ListRow = YoutubeFavoriteEntry & { playCount?: number }
const listSource = computed<ListRow[]>(() => (tab.value === 'favorites' ? favorites.value : history.value))
const filteredList = computed(() => filterYoutubeHistory(listSource.value, historyFilter.value))
watch(tab, () => { historyFilter.value = '' })

function removeRow(videoId: string) {
  if (tab.value === 'favorites') favorites.value = removeYoutubeFavorite(videoId)
  else removeFromHistory(videoId)
}
const confirmClearOpen = ref(false)

function removeFromHistory(videoId: string) {
  history.value = removeYoutubeHistoryEntry(videoId)
}

function confirmClear() {
  history.value = clearYoutubeHistory()
  confirmClearOpen.value = false
}

/* ---------- Coletâneas online ---------- */
const collections = ref<YoutubeCollection[]>(listYoutubeCollections())
const openCollectionId = ref<string | null>(null)
const openCollection = computed(() => collections.value.find((c) => c.id === openCollectionId.value) ?? null)
const newCollectionName = ref('')
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const deletingCollection = ref<YoutubeCollection | null>(null)

function openCollections() {
  tab.value = 'collections'
  openCollectionId.value = null
}

function createCollection() {
  const { list, created } = createYoutubeCollection(newCollectionName.value)
  collections.value = list
  if (created) newCollectionName.value = ''
}

/* Colar playlist do YouTube → nova coletânea */
const playlistImportOpen = ref(false)

function createFromPlaylist(name: string, items: YoutubeSearchItem[]) {
  const { created } = createYoutubeCollection(name)
  playlistImportOpen.value = false
  if (!created) return
  collections.value = addVideosToYoutubeCollection(created.id, items)
  openCollectionId.value = created.id
}

function startRename(collection: YoutubeCollection) {
  renamingId.value = collection.id
  renameDraft.value = collection.name
}

function commitRename() {
  if (renamingId.value) collections.value = renameYoutubeCollection(renamingId.value, renameDraft.value)
  renamingId.value = null
}

function confirmDeleteCollection() {
  const target = deletingCollection.value
  if (target) {
    collections.value = deleteYoutubeCollection(target.id)
    if (openCollectionId.value === target.id) openCollectionId.value = null
  }
  deletingCollection.value = null
}

function moveInCollection(videoId: string, delta: -1 | 1) {
  if (openCollection.value) collections.value = moveVideoInYoutubeCollection(openCollection.value.id, videoId, delta)
}

function removeFromCollection(videoId: string) {
  if (openCollection.value) collections.value = removeVideoFromYoutubeCollection(openCollection.value.id, videoId)
}

function collectionCover(collection: YoutubeCollection): string[] {
  return collection.videos.slice(0, 4).map((v) => thumbOf(v))
}

/* Janela "Adicionar à coletânea" */
const pickerVideo = ref<PlayableVideo | null>(null)
const pickerNewName = ref('')

function openPicker(video: PlayableVideo) {
  pickerVideo.value = { ...video }
  pickerNewName.value = ''
  collections.value = listYoutubeCollections()
}

function inCollection(collection: YoutubeCollection): boolean {
  return pickerVideo.value ? collectionHasVideo(collection, pickerVideo.value.videoId) : false
}

function togglePickerCollection(collection: YoutubeCollection) {
  const video = pickerVideo.value
  if (!video) return
  collections.value = inCollection(collection)
    ? removeVideoFromYoutubeCollection(collection.id, video.videoId)
    : addVideoToYoutubeCollection(collection.id, video)
}

function createFromPicker() {
  const video = pickerVideo.value
  const { list, created } = createYoutubeCollection(pickerNewName.value)
  collections.value = created && video ? addVideoToYoutubeCollection(created.id, video) : list
  if (created) pickerNewName.value = ''
}

function isInAnyCollection(videoId: string): boolean {
  return collections.value.some((c) => collectionHasVideo(c, videoId))
}

/* ---------- Minimizar (barra acima do dock) ---------- */
type YoutubeSnapshot = {
  tab: Tab
  query: string
  lastQuery: string
  results: YoutubeSearchItem[]
  continuation: YoutubeSearchContinuation | null
  historyFilter: string
  openCollectionId: string | null
}

const { minimize, prepare, takeRestoredState } = useMinimizablePage<YoutubeSnapshot>({
  describe: () => {
    const q = lastQuery.value.trim()
    const summary = tab.value === 'search' && q
      ? t('minimize.search', { q })
      : tab.value === 'collections' && openCollection.value
        ? openCollection.value.name
        : t(tab.value === 'collections' ? 'youtube.collections.title' : `youtube.tabs.${tab.value}`)
    return { title: t('youtube.title'), icon: 'ti-brand-youtube', summary }
  },
  capture: () => ({
    tab: tab.value,
    query: query.value,
    lastQuery: lastQuery.value,
    results: results.value.map((item) => ({ ...item })),
    continuation: continuation.value ? { ...continuation.value } : null,
    historyFilter: historyFilter.value,
    openCollectionId: openCollectionId.value,
  }),
  fallbackRoute: { name: 'albums' },
})

// Reaberta pela barra: volta com a aba, a busca (e os resultados) e a coletânea abertas.
const restored = takeRestoredState()
if (restored) {
  tab.value = restored.tab
  query.value = restored.query
  lastQuery.value = restored.lastQuery
  results.value = restored.results
  continuation.value = restored.continuation
  openCollectionId.value = restored.openCollectionId
  // depois do watch da aba (que limpa o filtro)
  void nextTick(() => { historyFilter.value = restored.historyFilter })
}

/* ---------- Downloads ---------- */
const downloads = useYoutubeDownloads()
/** Pedido de download aguardando o "Onde salvar?": um vídeo ou todos de uma coletânea. */
const downloadTarget = ref<{ title: string; ids: string[] } | null>(null)
const storageChip = ref<{ refresh: () => Promise<void> } | null>(null)

/** Vídeos na tela agora: o estado de download deles é consultado ao aparecerem. */
const visibleIds = computed(() => {
  if (tab.value === 'search') return results.value.map((v) => v.videoId)
  if (tab.value === 'history') return history.value.map((v) => v.videoId)
  if (tab.value === 'favorites') return favorites.value.map((v) => v.videoId)
  return openCollection.value?.videos.map((v) => v.videoId) ?? []
})
watch([visibleIds, downloads.supported], ([ids]) => { void downloads.refresh(ids) }, { immediate: true })

function askDownload(video: PlayableVideo) {
  downloadTarget.value = { title: video.title, ids: [video.videoId] }
}

/* Apagar a cópia baixada de um vídeo */
const removingDownload = ref<PlayableVideo | null>(null)

async function confirmRemoveDownload() {
  const video = removingDownload.value
  removingDownload.value = null
  if (!video) return
  if (!(await downloads.remove(video.videoId))) showFeedback(t('youtube.download.removeFailed'))
  void storageChip.value?.refresh()
}

async function confirmDownload() {
  const target = downloadTarget.value
  downloadTarget.value = null
  if (target && !(await downloads.download(target.ids))) showFeedback(t('youtube.download.failed'))
  void storageChip.value?.refresh()
}

/* Baixar todos da coletânea aberta */
const collectionPending = computed(() =>
  (openCollection.value?.videos ?? []).filter((v) => {
    const state = downloads.statuses.value[v.videoId]?.state
    return state !== 'ready' && !isDownloading(downloads.statuses.value[v.videoId])
  }),
)
const collectionBusy = computed(() =>
  (openCollection.value?.videos ?? []).filter((v) => isDownloading(downloads.statuses.value[v.videoId])).length,
)

/** Parar: cancela os downloads da coletânea em andamento ou na fila (os prontos ficam). */
const stoppingCollection = ref(false)
async function stopCollectionDownloads() {
  const busy = (openCollection.value?.videos ?? []).filter((v) => isDownloading(downloads.statuses.value[v.videoId]))
  if (busy.length === 0 || stoppingCollection.value) return
  stoppingCollection.value = true
  try {
    await Promise.all(busy.map((v) => downloads.cancel(v.videoId).catch(() => {})))
  } finally {
    stoppingCollection.value = false
    void storageChip.value?.refresh()
  }
}

function askDownloadCollection() {
  const collection = openCollection.value
  if (!collection || collectionPending.value.length === 0) return
  downloadTarget.value = {
    title: t('youtube.download.allTitle', { name: collection.name, n: collectionPending.value.length }),
    ids: collectionPending.value.map((v) => v.videoId),
  }
}

/* ---------- Tocar ---------- */
const playingId = ref<string | null>(null)
const feedback = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

function showFeedback(message: string) {
  feedback.value = message
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedback.value = '' }, 3500)
}

async function play(video: PlayableVideo, screens: boolean) {
  if (playingId.value) return
  playingId.value = video.videoId
  try {
    const ok = await playYoutubeVideo(video.videoId, video.title, screens)
    if (ok) history.value = recordYoutubePlay(video)
    else showFeedback(t('youtube.actions.failed'))
  } catch {
    showFeedback(t('youtube.actions.failed'))
  } finally {
    playingId.value = null
  }
}

function formatPlayedAt(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function thumbOf(video: { videoId: string; thumbnail?: string }): string {
  return video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
}

function goBack() {
  void router.push({ name: 'albums' })
}
</script>

<template>
  <section class="yt-view">
    <header class="yt-view__header">
      <div class="yt-view__brand">
        <PageBackStack @minimize="minimize" @prepare="prepare">
          <button
            type="button"
            class="yt-view__back"
            :aria-label="t('youtube.back')"
            :title="t('youtube.back')"
            @click="goBack"
          >
            <i class="ti ti-arrow-left" aria-hidden="true" />
          </button>
        </PageBackStack>
        <div class="yt-view__icon">
          <i class="ti ti-brand-youtube" aria-hidden="true" />
        </div>
        <div class="yt-view__headings">
          <h1 class="yt-view__title">{{ t('youtube.title') }}</h1>
          <p class="yt-view__subtitle">{{ t('youtube.subtitle') }}</p>
        </div>
      </div>

      <div class="yt-view__header-actions">
      <YoutubeStorageChip ref="storageChip" />
      <button
        type="button"
        class="yt-view__collections-btn"
        :class="{ 'is-active': tab === 'collections' }"
        data-testid="youtube-open-collections"
        @click="openCollections"
      >
        <i class="ti ti-playlist" aria-hidden="true" />
        {{ t('youtube.collections.title') }}
        <span v-if="collections.length > 0" class="yt-view__count">{{ collections.length }}</span>
      </button>
      <div class="yt-view__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="yt-view__tab"
          :class="{ 'is-active': tab === 'search' }"
          :aria-selected="tab === 'search'"
          data-testid="youtube-tab-search"
          @click="tab = 'search'"
        >
          <i class="ti ti-search" aria-hidden="true" />
          {{ t('youtube.tabs.search') }}
        </button>
        <button
          type="button"
          role="tab"
          class="yt-view__tab"
          :class="{ 'is-active': tab === 'history' }"
          :aria-selected="tab === 'history'"
          data-testid="youtube-tab-history"
          @click="tab = 'history'"
        >
          <i class="ti ti-history" aria-hidden="true" />
          {{ t('youtube.tabs.history') }}
          <span v-if="history.length > 0" class="yt-view__count">{{ history.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="yt-view__tab"
          :class="{ 'is-active': tab === 'favorites' }"
          :aria-selected="tab === 'favorites'"
          data-testid="youtube-tab-favorites"
          @click="tab = 'favorites'"
        >
          <i class="ti ti-heart" aria-hidden="true" />
          {{ t('youtube.tabs.favorites') }}
          <span v-if="favorites.length > 0" class="yt-view__count">{{ favorites.length }}</span>
        </button>
      </div>
      </div>
    </header>

    <!-- Busca -->
    <template v-if="tab === 'search'">
      <form class="yt-view__searchbar" @submit.prevent="runSearch()">
        <label class="yt-view__field">
          <i class="ti ti-brand-youtube" aria-hidden="true" />
          <input
            v-model="query"
            type="search"
            :placeholder="t('youtube.search.placeholder')"
            :disabled="!available"
            data-testid="youtube-search-input"
            autofocus
          >
        </label>
        <button
          type="submit"
          class="yt-view__primary"
          :disabled="!available || searching || !query.trim()"
        >
          <i class="ti" :class="searching ? 'ti-loader-2 yt-spin' : 'ti-search'" aria-hidden="true" />
          {{ t('youtube.search.submit') }}
        </button>
      </form>

      <div v-if="recentQueries.length > 0 && available" class="yt-view__recent">
        <span class="yt-view__recent-label">{{ t('youtube.search.recent') }}</span>
        <span v-for="q in recentQueries" :key="q" class="yt-view__chip">
          <button type="button" class="yt-view__chip-text" @click="runSearch(q)">{{ q }}</button>
          <button
            type="button"
            class="yt-view__chip-x"
            :aria-label="t('youtube.search.forget', { query: q })"
            @click="forgetQuery(q)"
          >
            <i class="ti ti-x" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div class="yt-view__body">
        <p v-if="!available" class="yt-view__empty">
          <i class="ti ti-device-desktop" aria-hidden="true" />
          {{ t('youtube.search.unavailable') }}
        </p>
        <p v-else-if="searching && results.length === 0" class="yt-view__empty">
          <i class="ti ti-loader-2 yt-spin" aria-hidden="true" />
          {{ t('youtube.search.loading') }}
        </p>
        <p v-else-if="searchError" class="yt-view__empty yt-view__empty--error">
          <i class="ti ti-wifi-off" aria-hidden="true" />
          {{ t('youtube.search.error') }}
        </p>
        <p v-else-if="!lastQuery" class="yt-view__empty">
          <i class="ti ti-music-search" aria-hidden="true" />
          {{ t('youtube.search.empty') }}
        </p>
        <p v-else-if="results.length === 0" class="yt-view__empty">
          <i class="ti ti-mood-empty" aria-hidden="true" />
          {{ t('youtube.search.noResults', { query: lastQuery }) }}
        </p>

        <ul v-else class="yt-view__grid" :class="{ 'is-stale': searching }">
          <li v-for="video in results" :key="video.videoId" class="yt-card">
            <button
              type="button"
              class="yt-card__thumb"
              :title="t('youtube.actions.playHint')"
              @click="play(video, false)"
            >
              <img :src="thumbOf(video)" :alt="''" loading="lazy">
              <span v-if="video.live" class="yt-card__badge yt-card__badge--live">{{ t('youtube.search.live') }}</span>
              <span v-else-if="video.durationText" class="yt-card__badge">{{ video.durationText }}</span>
              <span class="yt-card__play">
                <i class="ti" :class="playingId === video.videoId ? 'ti-loader-2 yt-spin' : 'ti-player-play'" aria-hidden="true" />
              </span>
            </button>
            <div class="yt-card__info">
              <p class="yt-card__title" :title="video.title">{{ video.title }}</p>
              <p class="yt-card__meta">
                {{ video.channel }}<template v-if="video.viewsText"> · {{ video.viewsText }}</template><template v-if="video.publishedText"> · {{ video.publishedText }}</template>
              </p>
            </div>
            <div class="yt-card__actions">
              <button
                v-if="downloads.supported.value && downloads.statuses.value[video.videoId]?.state === 'ready'"
                type="button"
                class="yt-fav yt-del"
                :aria-label="t('youtube.download.remove')"
                :title="t('youtube.download.remove')"
                data-testid="youtube-download-remove"
                @click="removingDownload = { ...video }"
              >
                <i class="ti ti-trash" aria-hidden="true" />
              </button>
              <YoutubeDownloadButton
                v-if="downloads.supported.value"
                :status="downloads.statuses.value[video.videoId]"
                @download="askDownload(video)"
                @cancel="downloads.cancel(video.videoId)"
              />
              <button
                type="button"
                class="yt-fav yt-add"
                :class="{ 'is-on': isInAnyCollection(video.videoId) }"
                :aria-label="t('youtube.collections.addTo')"
                :title="t('youtube.collections.addTo')"
                @click="openPicker(video)"
              >
                <i class="ti ti-playlist-add" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="yt-fav"
                :class="{ 'is-on': isFavorite(video.videoId) }"
                :aria-pressed="isFavorite(video.videoId)"
                :aria-label="isFavorite(video.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                :title="isFavorite(video.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                @click="toggleFavorite(video)"
              >
                <i class="ti ti-heart" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="yt-card__btn"
                :title="t('youtube.actions.playHint')"
                :disabled="playingId !== null"
                @click="play(video, false)"
              >
                <i class="ti ti-player-play" aria-hidden="true" />
                {{ t('youtube.actions.play') }}
              </button>
              <button
                type="button"
                class="yt-card__btn yt-card__btn--primary"
                :title="t('youtube.actions.projectHint')"
                :disabled="playingId !== null"
                @click="play(video, true)"
              >
                <i class="ti ti-device-tv" aria-hidden="true" />
                {{ t('youtube.actions.project') }}
              </button>
            </div>
          </li>
        </ul>

        <div v-if="available && continuation && results.length > 0" ref="moreSentinel" class="yt-view__more">
          <button type="button" class="yt-view__secondary" :disabled="loadingMore" @click="loadMore">
            <i class="ti" :class="loadingMore ? 'ti-loader-2 yt-spin' : 'ti-chevrons-down'" aria-hidden="true" />
            {{ t('youtube.search.more') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Histórico / Favoritos -->
    <template v-else-if="tab === 'history' || tab === 'favorites'">
      <div class="yt-view__searchbar">
        <label class="yt-view__field">
          <i class="ti ti-filter" aria-hidden="true" />
          <input
            v-model="historyFilter"
            type="search"
            :placeholder="tab === 'favorites' ? t('youtube.favorites.filter') : t('youtube.history.filter')"
            data-testid="youtube-history-filter"
          >
        </label>
        <span class="yt-view__hint">{{ t('youtube.history.count', { n: listSource.length }) }}</span>
        <button
          v-if="tab === 'history'"
          type="button"
          class="yt-view__secondary yt-view__secondary--danger"
          :disabled="history.length === 0"
          @click="confirmClearOpen = true"
        >
          <i class="ti ti-trash" aria-hidden="true" />
          {{ t('youtube.history.clear') }}
        </button>
      </div>

      <div class="yt-view__body">
        <p v-if="listSource.length === 0" class="yt-view__empty">
          <i class="ti" :class="tab === 'favorites' ? 'ti-heart' : 'ti-history'" aria-hidden="true" />
          {{ tab === 'favorites' ? t('youtube.favorites.empty') : t('youtube.history.empty') }}
        </p>
        <p v-else-if="filteredList.length === 0" class="yt-view__empty">
          <i class="ti ti-mood-empty" aria-hidden="true" />
          {{ t('youtube.history.noMatch', { query: historyFilter }) }}
        </p>
        <ul v-else class="yt-view__list">
          <li v-for="entry in filteredList" :key="entry.videoId" class="yt-row">
            <button
              type="button"
              class="yt-row__thumb"
              :title="t('youtube.actions.playHint')"
              @click="play(entry, false)"
            >
              <img :src="thumbOf(entry)" :alt="''" loading="lazy">
              <span v-if="entry.durationText" class="yt-card__badge">{{ entry.durationText }}</span>
            </button>
            <div class="yt-row__info">
              <p class="yt-card__title" :title="entry.title">{{ entry.title }}</p>
              <p v-if="tab === 'history'" class="yt-card__meta">
                <template v-if="entry.channel">{{ entry.channel }} · </template>{{ formatPlayedAt(entry.playedAt) }} · {{ t('youtube.history.plays', { n: entry.playCount ?? 1 }) }}
              </p>
              <p v-else class="yt-card__meta">{{ entry.channel }}</p>
            </div>
            <div class="yt-row__actions">
              <button
                v-if="downloads.supported.value && downloads.statuses.value[entry.videoId]?.state === 'ready'"
                type="button"
                class="yt-fav yt-del"
                :aria-label="t('youtube.download.remove')"
                :title="t('youtube.download.remove')"
                data-testid="youtube-download-remove"
                @click="removingDownload = { ...entry }"
              >
                <i class="ti ti-trash" aria-hidden="true" />
              </button>
              <YoutubeDownloadButton
                v-if="downloads.supported.value"
                :status="downloads.statuses.value[entry.videoId]"
                @download="askDownload(entry)"
                @cancel="downloads.cancel(entry.videoId)"
              />
              <button
                type="button"
                class="yt-fav yt-add"
                :class="{ 'is-on': isInAnyCollection(entry.videoId) }"
                :aria-label="t('youtube.collections.addTo')"
                :title="t('youtube.collections.addTo')"
                @click="openPicker(entry)"
              >
                <i class="ti ti-playlist-add" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="yt-fav"
                :class="{ 'is-on': isFavorite(entry.videoId) }"
                :aria-pressed="isFavorite(entry.videoId)"
                :aria-label="isFavorite(entry.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                :title="isFavorite(entry.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                @click="toggleFavorite(entry)"
              >
                <i class="ti ti-heart" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="yt-card__btn"
                :title="t('youtube.actions.playHint')"
                :disabled="playingId !== null"
                @click="play(entry, false)"
              >
                <i class="ti" :class="playingId === entry.videoId ? 'ti-loader-2 yt-spin' : 'ti-player-play'" aria-hidden="true" />
                {{ t('youtube.actions.play') }}
              </button>
              <button
                type="button"
                class="yt-card__btn yt-card__btn--primary"
                :title="t('youtube.actions.projectHint')"
                :disabled="playingId !== null"
                @click="play(entry, true)"
              >
                <i class="ti ti-device-tv" aria-hidden="true" />
                {{ t('youtube.actions.project') }}
              </button>
              <button
                v-if="tab === 'history'"
                type="button"
                class="yt-row__remove"
                :aria-label="t('youtube.actions.remove')"
                :title="t('youtube.actions.remove')"
                @click="removeRow(entry.videoId)"
              >
                <i class="ti ti-x" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <!-- Coletâneas online -->
    <template v-else>
      <!-- Lista de coletâneas -->
      <template v-if="!openCollection">
        <form class="yt-view__searchbar" @submit.prevent="createCollection">
          <label class="yt-view__field">
            <i class="ti ti-playlist-add" aria-hidden="true" />
            <input
              v-model="newCollectionName"
              type="text"
              :maxlength="80"
              :placeholder="t('youtube.collections.newPlaceholder')"
              data-testid="youtube-collection-new"
            >
          </label>
          <button type="submit" class="yt-view__primary" :disabled="!newCollectionName.trim()">
            <i class="ti ti-plus" aria-hidden="true" />
            {{ t('youtube.collections.create') }}
          </button>
          <button
            v-if="available"
            type="button"
            class="yt-view__secondary"
            data-testid="youtube-collection-from-playlist"
            @click="playlistImportOpen = true"
          >
            <i class="ti ti-brand-youtube" aria-hidden="true" />
            {{ t('youtube.playlist.open') }}
          </button>
        </form>

        <div class="yt-view__body">
          <p v-if="collections.length === 0" class="yt-view__empty">
            <i class="ti ti-playlist" aria-hidden="true" />
            {{ t('youtube.collections.empty') }}
          </p>
          <ul v-else class="yt-view__grid">
            <li v-for="collection in collections" :key="collection.id" class="yt-card yt-col">
              <button type="button" class="yt-col__cover" @click="openCollectionId = collection.id">
                <span v-if="collection.videos.length === 0" class="yt-col__cover-empty">
                  <i class="ti ti-playlist" aria-hidden="true" />
                </span>
                <span v-else class="yt-col__mosaic" :class="`is-${Math.min(collection.videos.length, 4)}`">
                  <img v-for="(src, i) in collectionCover(collection)" :key="i" :src="src" alt="" loading="lazy">
                </span>
                <span class="yt-card__badge">{{ t('youtube.collections.videoCount', { n: collection.videos.length }) }}</span>
              </button>
              <div class="yt-card__info">
                <form v-if="renamingId === collection.id" class="yt-col__rename" @submit.prevent="commitRename">
                  <input
                    v-model="renameDraft"
                    type="text"
                    :maxlength="80"
                    :aria-label="t('youtube.collections.rename')"
                    @keydown.esc="renamingId = null"
                    @blur="commitRename"
                  >
                </form>
                <p v-else class="yt-card__title" :title="collection.name">{{ collection.name }}</p>
              </div>
              <div class="yt-card__actions">
                <button type="button" class="yt-card__btn yt-card__btn--primary" @click="openCollectionId = collection.id">
                  <i class="ti ti-folder-open" aria-hidden="true" />
                  {{ t('youtube.collections.open') }}
                </button>
                <button
                  type="button"
                  class="yt-fav"
                  :aria-label="t('youtube.collections.rename')"
                  :title="t('youtube.collections.rename')"
                  @click="startRename(collection)"
                >
                  <i class="ti ti-pencil" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="yt-fav yt-del"
                  :aria-label="t('youtube.collections.delete')"
                  :title="t('youtube.collections.delete')"
                  @click="deletingCollection = collection"
                >
                  <i class="ti ti-trash" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>

      <!-- Dentro de uma coletânea -->
      <template v-else>
        <div class="yt-view__searchbar">
          <button
            type="button"
            class="yt-view__back"
            :aria-label="t('youtube.collections.backToList')"
            :title="t('youtube.collections.backToList')"
            @click="openCollectionId = null"
          >
            <i class="ti ti-arrow-left" aria-hidden="true" />
          </button>
          <form v-if="renamingId === openCollection.id" class="yt-col__rename yt-col__rename--title" @submit.prevent="commitRename">
            <input
              v-model="renameDraft"
              type="text"
              :maxlength="80"
              :aria-label="t('youtube.collections.rename')"
              @keydown.esc="renamingId = null"
              @blur="commitRename"
            >
          </form>
          <h2 v-else class="yt-col__name">{{ openCollection.name }}</h2>
          <span class="yt-view__hint">{{ t('youtube.collections.videoCount', { n: openCollection.videos.length }) }}</span>
          <span class="yt-col__spacer" />
          <button
            v-if="downloads.supported.value && openCollection.videos.length > 0"
            type="button"
            class="yt-view__secondary"
            :disabled="collectionPending.length === 0"
            data-testid="youtube-collection-download-all"
            @click="askDownloadCollection"
          >
            <i class="ti" :class="collectionBusy > 0 ? 'ti-loader-2 yt-spin' : collectionPending.length === 0 ? 'ti-circle-check' : 'ti-download'" aria-hidden="true" />
            <template v-if="collectionBusy > 0">{{ t('youtube.download.allBusy', { n: collectionBusy }) }}</template>
            <template v-else-if="collectionPending.length === 0">{{ t('youtube.download.allDone') }}</template>
            <template v-else>{{ t('youtube.download.all', { n: collectionPending.length }) }}</template>
          </button>
          <button
            v-if="collectionBusy > 0"
            type="button"
            class="yt-view__secondary yt-view__secondary--danger"
            :disabled="stoppingCollection"
            :title="t('youtube.download.stopHint')"
            data-testid="youtube-collection-download-stop"
            @click="stopCollectionDownloads"
          >
            <i class="ti ti-player-stop" aria-hidden="true" />
            {{ t('youtube.download.stop') }}
          </button>
          <button type="button" class="yt-view__secondary" @click="startRename(openCollection)">
            <i class="ti ti-pencil" aria-hidden="true" />
            {{ t('youtube.collections.rename') }}
          </button>
          <button type="button" class="yt-view__secondary" @click="tab = 'search'">
            <i class="ti ti-search" aria-hidden="true" />
            {{ t('youtube.collections.addFromSearch') }}
          </button>
          <button
            type="button"
            class="yt-view__secondary yt-view__secondary--danger"
            @click="deletingCollection = openCollection"
          >
            <i class="ti ti-trash" aria-hidden="true" />
            {{ t('youtube.collections.delete') }}
          </button>
        </div>

        <div class="yt-view__body">
          <p v-if="openCollection.videos.length === 0" class="yt-view__empty">
            <i class="ti ti-playlist-add" aria-hidden="true" />
            {{ t('youtube.collections.emptyVideos') }}
          </p>
          <ol v-else class="yt-view__list">
            <li v-for="(entry, index) in openCollection.videos" :key="entry.videoId" class="yt-row">
              <span class="yt-col__pos">{{ index + 1 }}</span>
              <button
                type="button"
                class="yt-row__thumb"
                :title="t('youtube.actions.playHint')"
                @click="play(entry, false)"
              >
                <img :src="thumbOf(entry)" :alt="''" loading="lazy">
                <span v-if="entry.durationText" class="yt-card__badge">{{ entry.durationText }}</span>
              </button>
              <div class="yt-row__info">
                <p class="yt-card__title" :title="entry.title">{{ entry.title }}</p>
                <p class="yt-card__meta">{{ entry.channel }}</p>
              </div>
              <div class="yt-row__actions">
                <button
                  v-if="downloads.supported.value && downloads.statuses.value[entry.videoId]?.state === 'ready'"
                  type="button"
                  class="yt-fav yt-del"
                  :aria-label="t('youtube.download.remove')"
                  :title="t('youtube.download.remove')"
                  data-testid="youtube-download-remove"
                  @click="removingDownload = { ...entry }"
                >
                  <i class="ti ti-trash" aria-hidden="true" />
                </button>
                <YoutubeDownloadButton
                  v-if="downloads.supported.value"
                  :status="downloads.statuses.value[entry.videoId]"
                  @download="askDownload(entry)"
                  @cancel="downloads.cancel(entry.videoId)"
                />
                <button
                  type="button"
                  class="yt-fav"
                  :disabled="index === 0"
                  :aria-label="t('youtube.collections.moveUp')"
                  :title="t('youtube.collections.moveUp')"
                  @click="moveInCollection(entry.videoId, -1)"
                >
                  <i class="ti ti-chevron-up" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="yt-fav"
                  :disabled="index === openCollection.videos.length - 1"
                  :aria-label="t('youtube.collections.moveDown')"
                  :title="t('youtube.collections.moveDown')"
                  @click="moveInCollection(entry.videoId, 1)"
                >
                  <i class="ti ti-chevron-down" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="yt-fav"
                  :class="{ 'is-on': isFavorite(entry.videoId) }"
                  :aria-pressed="isFavorite(entry.videoId)"
                  :aria-label="isFavorite(entry.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                  :title="isFavorite(entry.videoId) ? t('youtube.favorites.remove') : t('youtube.favorites.add')"
                  @click="toggleFavorite(entry)"
                >
                  <i class="ti ti-heart" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="yt-card__btn"
                  :title="t('youtube.actions.playHint')"
                  :disabled="playingId !== null"
                  @click="play(entry, false)"
                >
                  <i class="ti" :class="playingId === entry.videoId ? 'ti-loader-2 yt-spin' : 'ti-player-play'" aria-hidden="true" />
                  {{ t('youtube.actions.play') }}
                </button>
                <button
                  type="button"
                  class="yt-card__btn yt-card__btn--primary"
                  :title="t('youtube.actions.projectHint')"
                  :disabled="playingId !== null"
                  @click="play(entry, true)"
                >
                  <i class="ti ti-device-tv" aria-hidden="true" />
                  {{ t('youtube.actions.project') }}
                </button>
                <button
                  type="button"
                  class="yt-row__remove"
                  :aria-label="t('youtube.collections.removeVideo')"
                  :title="t('youtube.collections.removeVideo')"
                  @click="removeFromCollection(entry.videoId)"
                >
                  <i class="ti ti-x" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>
        </div>
      </template>
    </template>

    <!-- Adicionar à coletânea -->
    <div v-if="pickerVideo" class="yt-picker" role="dialog" aria-modal="true" :aria-label="t('youtube.collections.addTo')" @click.self="pickerVideo = null" @keydown.esc="pickerVideo = null">
      <div class="yt-picker__panel">
        <header class="yt-picker__head">
          <div class="yt-picker__heading">
            <h2>{{ t('youtube.collections.addTo') }}</h2>
            <p :title="pickerVideo.title">{{ pickerVideo.title }}</p>
          </div>
          <button type="button" class="yt-row__remove" :aria-label="t('youtube.collections.close')" @click="pickerVideo = null">
            <i class="ti ti-x" aria-hidden="true" />
          </button>
        </header>
        <p v-if="collections.length === 0" class="yt-view__hint yt-picker__empty">{{ t('youtube.collections.pickerEmpty') }}</p>
        <ul v-else class="yt-picker__list">
          <li v-for="collection in collections" :key="collection.id">
            <button
              type="button"
              class="yt-picker__item"
              :class="{ 'is-on': inCollection(collection) }"
              :aria-pressed="inCollection(collection)"
              @click="togglePickerCollection(collection)"
            >
              <span class="yt-picker__check">
                <i v-if="inCollection(collection)" class="ti ti-check" aria-hidden="true" />
              </span>
              <span class="yt-picker__name">{{ collection.name }}</span>
              <span class="yt-view__hint">{{ t('youtube.collections.videoCount', { n: collection.videos.length }) }}</span>
            </button>
          </li>
        </ul>
        <form class="yt-picker__new" @submit.prevent="createFromPicker">
          <input
            v-model="pickerNewName"
            type="text"
            :maxlength="80"
            :placeholder="t('youtube.collections.newPlaceholder')"
          >
          <button type="submit" class="yt-view__primary" :disabled="!pickerNewName.trim()">
            <i class="ti ti-plus" aria-hidden="true" />
            {{ t('youtube.collections.createAndAdd') }}
          </button>
        </form>
      </div>
    </div>

    <AppConfirm
      :open="removingDownload !== null"
      :title="t('youtube.download.removeTitle')"
      :message="t('youtube.download.removeMessage', { title: removingDownload?.title ?? '' })"
      :confirm-label="t('youtube.download.removeConfirm')"
      :cancel-label="t('youtube.history.cancel')"
      danger
      @confirm="confirmRemoveDownload"
      @cancel="removingDownload = null"
    />

    <YoutubePlaylistImportDialog
      :open="playlistImportOpen"
      @close="playlistImportOpen = false"
      @create="createFromPlaylist"
    />

    <YoutubeDownloadDialog
      :open="downloadTarget !== null"
      :title="downloadTarget?.title ?? ''"
      @close="downloadTarget = null"
      @confirm="confirmDownload"
    />

    <Transition name="yt-toast">
      <div v-if="feedback" class="yt-view__toast" role="status">
        <i class="ti ti-alert-circle" aria-hidden="true" />
        {{ feedback }}
      </div>
    </Transition>

    <AppConfirm
      :open="confirmClearOpen"
      :title="t('youtube.history.clearTitle')"
      :message="t('youtube.history.clearMessage')"
      :confirm-label="t('youtube.history.clearConfirm')"
      :cancel-label="t('youtube.history.cancel')"
      danger
      @confirm="confirmClear"
      @cancel="confirmClearOpen = false"
    />

    <AppConfirm
      :open="deletingCollection !== null"
      :title="t('youtube.collections.deleteTitle', { name: deletingCollection?.name ?? '' })"
      :message="t('youtube.collections.deleteMessage')"
      :confirm-label="t('youtube.collections.deleteConfirm')"
      :cancel-label="t('youtube.history.cancel')"
      danger
      @confirm="confirmDeleteCollection"
      @cancel="deletingCollection = null"
    />
  </section>
</template>

<style scoped lang="scss">
.yt-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: 0.75rem var(--ds-spacing-page, 2rem) 1rem;
  overflow: hidden;
}

.yt-view__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.yt-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.yt-view__back {
  width: 2.25rem;
  height: 2.25rem;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  &:hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }
}

.yt-view__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem 0 0.75rem 0;
  display: inline-grid;
  place-items: center;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  flex-shrink: 0;
  .ti { font-size: 1.5rem; }
}

.yt-view__headings { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.yt-view__title { margin: 0; font-size: 1.45rem; font-weight: 700; line-height: 1.15; }
.yt-view__subtitle { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--ds-color-primary); }

.yt-view__header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.yt-view__collections-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ds-color-surface-card) 70%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  .ti { color: var(--ds-color-primary); font-size: 1.1rem; }
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
  &.is-active {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  }
}

.yt-view__tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ds-color-surface-card) 70%, transparent);
  border: 1px solid var(--ds-color-outline);
}

.yt-view__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  &.is-active {
    background: color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
    color: var(--ds-color-on-surface);
    .ti { color: var(--ds-color-primary); }
  }
}

.yt-view__count {
  min-width: 1.3rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 0.72rem;
  line-height: 1.3rem;
  text-align: center;
}

.yt-view__searchbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.yt-view__field {
  flex: 1 1 18rem;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.7rem 1rem;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 82%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  &:focus-within { border-color: var(--ds-color-primary); }
  .ti { color: var(--ds-color-primary); font-size: 1.25rem; flex-shrink: 0; }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ds-color-on-surface);
    font: inherit;
    font-size: 1rem;
  }
}

.yt-view__primary,
.yt-view__secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.2rem;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
}

.yt-view__primary {
  border: 0;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
}

.yt-view__secondary {
  border: 1px solid var(--ds-color-outline);
  background: color-mix(in srgb, var(--ds-color-surface-card) 70%, transparent);
  color: var(--ds-color-on-surface);
  .ti { color: var(--ds-color-primary); }
  &:not(:disabled):hover { border-color: var(--ds-color-primary); }
  &--danger .ti { color: var(--ds-color-error, #e5484d); }
  &--danger:not(:disabled):hover { border-color: var(--ds-color-error, #e5484d); }
}

.yt-view__hint { font-size: 0.85rem; color: var(--ds-color-on-surface-variant); }

.yt-view__recent {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.yt-view__recent-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ds-color-on-surface-variant);
}

.yt-view__chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 70%, transparent);
  overflow: hidden;
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 50%, transparent); }
}

.yt-view__chip-text,
.yt-view__chip-x {
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  cursor: pointer;
}
.yt-view__chip-text { padding: 0.3rem 0.4rem 0.3rem 0.75rem; font-size: 0.82rem; }
.yt-view__chip-x {
  display: inline-grid;
  place-items: center;
  padding: 0.3rem 0.55rem 0.3rem 0.2rem;
  color: var(--ds-color-on-surface-variant);
  &:hover { color: var(--ds-color-error, #e5484d); }
}

.yt-view__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.yt-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin: 3rem auto;
  max-width: 28rem;
  text-align: center;
  color: var(--ds-color-on-surface-variant);
  .ti { font-size: 2.4rem; color: var(--ds-color-primary); }
  &--error .ti { color: var(--ds-color-error, #e5484d); }
}

.yt-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  transition: opacity 150ms ease;
  &.is-stale { opacity: 0.5; }
}

.yt-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 75%, transparent);
  overflow: hidden;
  transition: border-color 150ms ease, transform 150ms ease;
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
}

.yt-card__thumb,
.yt-row__thumb {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  background: #000;
  cursor: pointer;
  overflow: hidden;
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
}

.yt-card__thumb { aspect-ratio: 16 / 9; }

.yt-card__play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 35%);
  opacity: 0;
  transition: opacity 150ms ease;
  .ti {
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 999px;
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
    font-size: 1.5rem;
  }
}
.yt-card__thumb:hover .yt-card__play,
.yt-card__thumb:focus-visible .yt-card__play { opacity: 1; }

.yt-card__badge {
  position: absolute;
  right: 0.4rem;
  bottom: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.3rem;
  background: rgb(0 0 0 / 80%);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  &--live { background: #cc0000; }
}

.yt-card__info { padding: 0.65rem 0.75rem 0.3rem; min-width: 0; }

.yt-card__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.3;
}

.yt-card__meta {
  margin: 0.3rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--ds-color-on-surface-variant);
}

.yt-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: auto;
  padding: 0.5rem 0.75rem 0.75rem;
}

.yt-card__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  .ti { color: var(--ds-color-primary); }
  &:not(:disabled):hover { border-color: var(--ds-color-primary); }
  &:disabled { opacity: 0.5; cursor: default; }
  &--primary {
    border-color: transparent;
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
    &:not(:disabled):hover { background: color-mix(in srgb, var(--ds-color-primary) 35%, transparent); }
  }
}

.yt-fav {
  flex: none;
  width: 2.1rem;
  height: 2.1rem;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, transform 150ms ease;
  &:hover { border-color: #e5484d; color: #e5484d; }
  &:active { transform: scale(0.9); }
  padding: 0;
  line-height: 0;
  // Ícone como bloco de altura exata, sem a sobra da linha de texto (que o empurrava para cima).
  .ti {
    display: block;
    width: 1.1rem;
    height: 1.1rem;
    font-size: 1.1rem;
    line-height: 1.1rem;
    text-align: center;
    transform: translateY(1px);
  }
  // Favoritado: botão cheio em vermelho (o pacote de ícones não tem o coração preenchido).
  &.is-on {
    border-color: #e5484d;
    background: #e5484d;
    color: #fff;
    &:hover { background: color-mix(in srgb, #e5484d 80%, #000); color: #fff; }
  }
}

.yt-fav:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
.yt-add.is-on {
  border-color: var(--ds-color-primary);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  &:hover { background: color-mix(in srgb, var(--ds-color-primary) 80%, #000); color: var(--ds-color-on-primary); }
}
.yt-add:not(.is-on):hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }
.yt-del:hover { border-color: var(--ds-color-error, #e5484d); color: var(--ds-color-error, #e5484d); }
.yt-col .yt-card__actions .yt-fav:not(.yt-del):hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }

.yt-col__cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  background: linear-gradient(135deg, #1c1c24, #0b0b0f);
  cursor: pointer;
  overflow: hidden;
}
.yt-col__cover-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  .ti { font-size: 2.6rem; color: var(--ds-color-primary); }
}
.yt-col__mosaic {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 2px;
  img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
  &.is-1 { grid-template: 1fr / 1fr; }
  &.is-2 { grid-template: 1fr / 1fr 1fr; }
  &.is-3 { grid-template: 1fr 1fr / 1fr 1fr; img:first-child { grid-row: span 2; } }
  &.is-4 { grid-template: 1fr 1fr / 1fr 1fr; }
}
.yt-col__rename {
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--ds-color-primary);
    border-radius: 0.4rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    outline: none;
  }
  &--title { flex: 0 1 24rem; input { font-size: 1.15rem; } }
}
.yt-col__name { margin: 0; font-size: 1.2rem; font-weight: 700; }
.yt-col__spacer { flex: 1; }
.yt-col__pos {
  flex: none;
  width: 1.8rem;
  text-align: center;
  font-weight: 700;
  color: var(--ds-color-on-surface-variant);
}

.yt-picker {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}
.yt-picker__panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: min(30rem, 100%);
  max-height: 80vh;
  padding: 1.1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 18px 50px rgb(0 0 0 / 50%);
}
.yt-picker__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.yt-picker__heading {
  min-width: 0;
  h2 { margin: 0; font-size: 1.1rem; }
  p { margin: 0.25rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; color: var(--ds-color-on-surface-variant); }
}
.yt-picker__empty { margin: 0; }
.yt-picker__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.yt-picker__item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.55rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
  &.is-on { border-color: var(--ds-color-primary); background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent); }
}
.yt-picker__check {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
  border: 1.5px solid var(--ds-color-outline-strong, var(--ds-color-outline));
  border-radius: 0.3rem;
  .is-on & { border-color: var(--ds-color-primary); background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
  .ti { font-size: 0.9rem; }
}
.yt-picker__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.yt-picker__new {
  display: flex;
  gap: 0.5rem;
  input {
    flex: 1;
    min-width: 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--ds-color-outline-strong, var(--ds-color-outline));
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font: inherit;
    outline: none;
    &:focus { border-color: var(--ds-color-primary); }
  }
  .yt-view__primary { padding: 0.6rem 0.9rem; white-space: nowrap; }
}

.yt-view__more { display: flex; justify-content: center; padding: 1.25rem 0 0.5rem; }

.yt-view__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.yt-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.5rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-surface-card) 75%, transparent);
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
}

.yt-row__thumb {
  flex-shrink: 0;
  width: 8.5rem;
  aspect-ratio: 16 / 9;
  border-radius: 0.45rem 0 0.45rem 0;
}

.yt-row__info { flex: 1 1 auto; min-width: 0; }

.yt-row__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  .yt-card__btn { flex: none; }
}

.yt-row__remove {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--ds-color-error, #e5484d) 15%, transparent); color: var(--ds-color-error, #e5484d); }
}

.yt-view__toast {
  position: fixed;
  bottom: calc(var(--ds-dock-height, 4rem) + 1.25rem);
  left: 50%;
  z-index: 1200;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  transform: translateX(-50%);
  padding: 0.7rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-error, #e5484d) 40%, transparent);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
  .ti { color: var(--ds-color-error, #e5484d); }
}
.yt-toast-enter-active, .yt-toast-leave-active { transition: opacity .25s ease, transform .25s ease; }
.yt-toast-enter-from, .yt-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(.6rem); }

.yt-spin { animation: yt-spin 0.9s linear infinite; }
@keyframes yt-spin { to { transform: rotate(360deg); } }
</style>
