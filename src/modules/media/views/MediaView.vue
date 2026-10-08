<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import MediaCloseDialog from '../components/MediaCloseDialog.vue'
import StagePaletteButton from '../../settings/components/StagePaletteButton.vue'
import MediaPlayerPill from '../components/MediaPlayerPill.vue'
import MediaSlideStage from '../components/MediaSlideStage.vue'
import { useMediaPlayer } from '../composables/useMediaPlayer'
import { revealItemInAside } from '../services/media-aside-scroll'
import { stripHtmlBreaks } from '../services/media-slides'
import type { MediaPlaybackMode } from '../types/media'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const stageRoot = ref<HTMLElement | null>(null)

const {
  session,
  hasSession,
  lastErrorKey,
  isPlaying,
  hasAudio,
  hasInstrumental,
  playbackMode,
  isProjecting,
  showPlaylist,
  closeConfirmOpen,
  slideIndex,
  slideCount,
  currentSlide,
  resolvedSlideImageUrl,
  ondemandDownloadPercent,
  preplayDownloadMusicId,
  ondemandNoticeVisible,
  ondemandDownloadDone,
  currentTimeLabel,
  durationLabel,
  progressRatio,
  slideProgressRatio,
  queue,
  queueIndex,
  jumpToQueue,
  volume,
  maximize,
  minimize,
  togglePlay,
  previousSlide,
  nextSlide,
  goToSlide,
  seekRatio,
  setVolume,
  switchMode,
  toggleProjection,
  audioOnTv,
  onToggleAudioOnTv,
  togglePlaylist,
  setPlaylistOpen,
  requestClose,
  cancelClose,
  close,
  clearError,
  syncProjectionFlag,
} = useMediaPlayer()

const playlistAsideEl = ref<HTMLElement | null>(null)

/** Slide/faixa em reprodução visível no painel lateral (auto-scroll). */
const activeListIndex = computed(() =>
  queue.value.length > 1 ? queueIndex.value : slideIndex.value,
)

watch(activeListIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  const aside = playlistAsideEl.value
  const active = aside?.querySelector<HTMLElement>('.media-window__playlist-item--active')
  if (aside && active) revealItemInAside(aside, active)
})

const stageLyric = computed(() => currentSlide.value?.lyric ?? '')
const stageTitle = computed(() => session.value?.title ?? '')
const stageImage = computed(
  () => resolvedSlideImageUrl.value ?? currentSlide.value?.imageUrl ?? null,
)
const isCover = computed(() => Boolean(currentSlide.value?.isCover))
const showOndemandNotice = computed(() => ondemandNoticeVisible.value)
const ondemandProgressRatio = computed(() =>
  Math.min(1, Math.max(0, (ondemandDownloadPercent.value ?? 0) / 100)),
)

const playlist = computed(() =>
  (session.value?.slides ?? []).map((slide, index) => ({
    index,
    label: slide.isCover
      ? slide.lyric || t('media.coverSlide')
      : stripHtmlBreaks(slide.lyric).replace(/\s+/g, ' ').slice(0, 90) ||
        t('media.slideOf', { current: index + 1, total: slideCount.value }),
    isCover: slide.isCover,
  })),
)

onMounted(() => {
  document.documentElement.classList.add('media-player-open')
  maximize()
  setPlaylistOpen(true)
  syncProjectionFlag()
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  document.documentElement.classList.remove('media-player-open')
  window.removeEventListener('keydown', onGlobalKeydown, true)
  // Dock / back / qualquer saída da rota: mesmo efeito do botão minimizar
  if (hasSession.value) {
    minimize()
  }
})

/** ESC fecha o player (←/→ ficam em useMediaPlayerHotkeys no App). */
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const target = event.target as HTMLElement | null
  if (target?.isContentEditable || target?.tagName === 'TEXTAREA') return
  if (target?.tagName === 'INPUT') {
    const type = ((target as HTMLInputElement).type || 'text').toLowerCase()
    if (
      !['button', 'checkbox', 'radio', 'range', 'file', 'reset', 'submit', 'color', 'hidden'].includes(
        type,
      )
    ) {
      return
    }
  }
  if (closeConfirmOpen.value) return
  event.preventDefault()
  requestClose()
}

/** Volta para a rota de origem (Liturgia, Álbuns, etc.), sem forçar Álbuns. */
function leaveMediaRoute() {
  if (window.history.length > 1) {
    void router.back()
    return
  }
  void router.replace({ name: 'albums' })
}

watch(hasSession, (active) => {
  if (!active) {
    // Fim natural da música: não expulsa se o usuário já navegou p/ outro
    // lugar (ex: editor de letras) — só redireciona quem está em /media.
    if (route.name === 'media') {
      leaveMediaRoute()
    }
  }
})

async function onMinimize() {
  minimize()
  leaveMediaRoute()
}

function onConfirmClose() {
  close()
}

async function onMode(mode: MediaPlaybackMode) {
  await switchMode(mode)
}

async function onToggleFullscreen() {
  const el = stageRoot.value
  /* v8 ignore next 3 -- stageRoot sempre renderizado; guard defensivo */
  if (!el) return
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await el.requestFullscreen()
}
</script>

<template>
  <div class="media-page">
    <section
      ref="stageRoot"
      class="media-window"
      tabindex="-1"
    >
    <header class="media-window__toolbar">
      <button
        type="button"
        class="media-window__tool-btn"
        :aria-label="t('media.minimize')"
        :title="t('media.minimize')"
        @click="onMinimize"
      >
        <i
          class="ti ti-minus"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="media-window__tool-btn"
        :aria-label="t('media.close')"
        :title="t('media.close')"
        @click="requestClose"
      >
        <i
          class="ti ti-x"
          aria-hidden="true"
        />
      </button>
    </header>

    <div
      v-if="lastErrorKey"
      class="media-window__alert"
      role="alert"
    >
      <p>{{ t(lastErrorKey) }}</p>
      <button
        type="button"
        @click="clearError"
      >
        {{ t('media.dismiss') }}
      </button>
    </div>

    <div
      v-else-if="!hasSession"
      class="media-window__empty"
    >
      {{ t('media.empty') }}
    </div>

    <div
      v-else
      class="media-window__body"
      :class="{ 'media-window__body--playlist': showPlaylist }"
    >
      <div class="media-window__stage">
        <div class="media-window__stage-palette">
          <p class="media-window__hotkey-hint">
            {{ t('media.projectionHotkeyHint') }}
          </p>
          <StagePaletteButton scope="hymns" />
        </div>
        <MediaSlideStage
          :lyric="stageLyric"
          :title="stageTitle"
          :image-url="stageImage"
          :is-cover="isCover"
        />
      </div>

      <aside
        v-if="showPlaylist"
        ref="playlistAsideEl"
        class="media-window__playlist"
      >
        <template v-if="queue.length > 1">
          <h2 class="media-window__playlist-title">Fila de reprodução</h2>
          <ul class="media-window__playlist-list">
            <li v-for="(item, index) in queue" :key="`${item.musicId}-${index}`">
              <button
                type="button"
                class="media-window__playlist-item"
                :class="{ 'media-window__playlist-item--active': index === queueIndex }"
                @click="jumpToQueue(index)"
              >
                <span class="media-window__playlist-index">{{ index + 1 }}</span>
                <span class="media-window__playlist-label">{{ item.title }}</span>
              </button>
            </li>
          </ul>
        </template>
        <template v-else>
          <h2 class="media-window__playlist-title">
            {{ t('media.playlist') }}
          </h2>
          <ul class="media-window__playlist-list">
            <li
              v-for="item in playlist"
              :key="item.index"
            >
              <button
                type="button"
                class="media-window__playlist-item"
                :class="{
                  'media-window__playlist-item--active': item.index === slideIndex,
                }"
                :style="
                  item.index === slideIndex
                    ? { '--slide-progress': slideProgressRatio }
                    : undefined
                "
                @click="goToSlide(item.index)"
              >
                <span class="media-window__playlist-index">{{ item.index + 1 }}</span>
                <span class="media-window__playlist-label">{{ item.label }}</span>
              </button>
            </li>
          </ul>
        </template>
      </aside>

      <div class="media-window__pill-wrap">
        <div class="media-window__pill-stack">
          <MediaPlayerPill
            :title="session?.title || t('media.title')"
            :subtitle="session?.subtitle || ''"
            :is-playing="isPlaying"
            :has-audio="hasAudio"
            :has-instrumental="hasInstrumental"
            :mode="playbackMode"
            :current-time-label="currentTimeLabel"
            :duration-label="durationLabel"
            :progress-ratio="progressRatio"
            :volume="volume"
            :projecting="isProjecting"
            :audio-on-tv="audioOnTv"
            :playlist-open="showPlaylist"
            @toggle-play="togglePlay"
            @previous-slide="previousSlide"
            @next-slide="nextSlide"
            @seek-ratio="seekRatio"
            @update:volume="setVolume"
            @update:mode="onMode"
            @toggle-projection="toggleProjection"
            @toggle-audio-on-tv="onToggleAudioOnTv"
            @toggle-playlist="togglePlaylist"
            @toggle-fullscreen="onToggleFullscreen"
          />
          <div
            v-if="showOndemandNotice"
            class="media-window__ondemand"
            :class="{ 'media-window__ondemand--done': ondemandDownloadDone }"
            aria-live="polite"
          >
            <div
              class="media-window__ondemand-track"
              role="progressbar"
              :aria-valuenow="ondemandDownloadPercent ?? 100"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="
                ondemandDownloadDone
                  ? t('media.ondemandDownloadSuccess')
                  : t('media.ondemandDownload')
              "
            >
              <div
                class="media-window__ondemand-fill"
                :style="{ transform: `scaleX(${ondemandProgressRatio})` }"
              />
            </div>
            <p
              class="media-window__ondemand-label"
              :class="{
                'media-window__ondemand-label--done': ondemandDownloadDone,
              }"
            >
              {{
                preplayDownloadMusicId && !ondemandDownloadDone
                  ? t('media.ondemandPreplay')
                  : ondemandDownloadDone
                  ? t('media.ondemandDownloadSuccess')
                  : t('media.ondemandDownload')
              }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <MediaCloseDialog
      :open="closeConfirmOpen"
      @cancel="cancelClose"
      @confirm="onConfirmClose"
    />
    </section>
  </div>
</template>

<style scoped lang="scss">
.media-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0.75rem var(--ds-spacing-page, 2rem) 1rem;
  overflow: hidden;
}

.media-window {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  outline: none;
  min-height: 0;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  overflow: hidden;
  background: #000;
  border: 1px solid rgb(255 255 255 / 0.08);
}

:global(html.media-player-open),
:global(html.media-player-open body) {
  overflow: hidden;
}

.media-window__toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 30;
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.25rem;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: rgb(30 30 30 / 0.75);
  border: 1px solid rgb(255 255 255 / 0.12);
}

.media-window__tool-btn {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgb(255 255 255 / 0.12);
  }
}

.media-window__body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
}

.media-window__body--playlist {
  grid-template-columns: minmax(0, 1fr) 18rem;
}

.media-window__stage {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.media-window__stage {
  position: relative;
}

.media-window__stage-palette {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  max-width: calc(100% - 5.5rem);
}

.media-window__hotkey-hint {
  margin: 0;
  padding: 0.45rem 0.8rem;
  border-radius: 10px;
  background: rgb(10 14 26 / 0.72);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.media-window__playlist {
  min-height: 0;
  overflow: auto;
  background: rgb(12 12 12 / 0.92);
  border-left: 1px solid rgb(255 255 255 / 0.08);
  padding: 1rem 0.75rem;
}

.media-window__playlist-title {
  margin: 0 0 0.75rem;
  padding: 0 0.4rem;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.55);
}

.media-window__playlist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.media-window__playlist-item {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  border: none;
  border-radius: 0.65rem 0 0.65rem 0;
  padding: 0.55rem 0.5rem;
  background: transparent;
  color: #fff;
  text-align: left;
  cursor: pointer;

  &::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: inherit;
    background: color-mix(
      in srgb,
      var(--ds-color-primary, #2196f3) 34%,
      transparent
    );
    transform: scaleX(var(--slide-progress, 0));
    transform-origin: left center;
    transition: transform 180ms linear;
    pointer-events: none;
  }

  &:hover {
    background: rgb(255 255 255 / 0.06);
  }

  &--active {
    background: rgb(255 255 255 / 0.055);
  }
}

.media-window__playlist-index {
  flex-shrink: 0;
  width: 1.5rem;
  font-size: 0.75rem;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}

.media-window__playlist-label {
  font-size: 0.82rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-window__stage {
  position: relative;
}

.media-window__pill-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 1.75rem;
  z-index: 25;
  display: flex;
  justify-content: center;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.media-window__pill-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.45rem;
  width: max-content;
  max-width: calc(100% - 2rem);
}

.media-window__ondemand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.75rem;
}

.media-window__ondemand-track {
  width: 100%;
  height: 0.2rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(255 255 255 / 0.18);
}

.media-window__ondemand-fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  transform: scaleX(0);
  background: linear-gradient(90deg, #f5c542 0%, #f59e0b 100%);
  transition: transform 0.2s ease-out;
}

.media-window__ondemand-label {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: rgb(255 255 255 / 0.72);
  text-align: center;
  transition:
    color 0.25s ease,
    text-shadow 0.25s ease,
    font-weight 0.25s ease;
}

.media-window__ondemand-label--done {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #f5c542;
  text-shadow: 0 0 12px rgb(245 197 66 / 0.45);
}

.media-window__ondemand--done .media-window__ondemand-fill {
  background: linear-gradient(90deg, #f5c542 0%, #ffe08a 50%, #f59e0b 100%);
}

.media-window__empty,
.media-window__alert {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: rgb(255 255 255 / 0.7);
  padding: 1.5rem;
}

.media-window__alert button {
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  background: transparent;
  color: #fff;
  cursor: pointer;
}

@media (max-width: 900px) {
  .media-window__body--playlist {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) 12rem;
  }

  .media-window__playlist {
    border-left: none;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
}

@media (max-width: 1280px) {
  .media-page {
    margin: 0.5rem 1rem 0.65rem;
  }

  .media-window__body--playlist {
    grid-template-columns: minmax(0, 1fr) 14rem;
  }

  .media-window__empty,
  .media-window__alert {
    padding: 1rem;
  }

  .media-window__pill-wrap {
    bottom: 1rem;
  }
}
</style>
