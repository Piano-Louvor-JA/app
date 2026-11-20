<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { LibraryAlbum } from '@modules/sync/types/library'

import type { AlbumCollection } from '../types/albums'

const props = defineProps<{
  collection: AlbumCollection
  libraryAlbum?: LibraryAlbum | null
  showDownloadControls?: boolean
}>()

const emit = defineEmits<{
  open: []
  download: []
  cancel: []
  remove: []
}>()

const { t } = useI18n()

const status = computed(() => props.libraryAlbum?.status ?? 'idle')
const progress = computed(() => props.libraryAlbum?.progress ?? 0)
const progressLabel = computed(() =>
  t(props.libraryAlbum?.progressText || 'sync.progress.downloading'),
)

const canRemove = computed(() => status.value === 'downloaded')
const isBusy = computed(() => status.value === 'downloading')
/** Coletânea custom (API /v1/custom): já está na API — nada pra baixar. */
const isCustom = computed(() => Boolean(props.collection.isCustom))
const showPersistentDownload = computed(
  () =>
    !isCustom.value &&
    Boolean(props.showDownloadControls) &&
    (status.value === 'idle' || status.value === 'error' || isBusy.value),
)

const coverSrc = computed(() => props.collection.coverUrl || '')

function onOpen() {
  emit('open')
}

function onDownload(event: MouseEvent) {
  event.stopPropagation()
  if (status.value === 'downloading') {
    emit('cancel')
    return
  }
  emit('download')
}

function onRemove(event: MouseEvent) {
  event.stopPropagation()
  /* v8 ignore next 1 -- botão só renderiza com canRemove true */
  if (!canRemove.value) return
  emit('remove')
}
</script>

<template>
  <article
    class="album-collection-card"
    :class="{
      'album-collection-card--downloaded': status === 'downloaded',
      'album-collection-card--busy': isBusy,
      'album-collection-card--pending': showPersistentDownload,
    }"
  >
    <div
      class="album-collection-card__cover"
      :class="{ 'album-collection-card__cover--custom': isCustom }"
    >
      <img
        v-if="coverSrc"
        class="album-collection-card__cover-img"
        :src="coverSrc"
        alt=""
        decoding="sync"
        loading="eager"
        draggable="false"
      />
      <i
        v-else
        class="ti album-collection-card__fallback"
        :class="collection.kind === 'hymnal' ? 'ti-book' : 'ti-disc'"
        aria-hidden="true"
      />

      <div
        v-if="showDownloadControls && status === 'downloaded'"
        class="album-collection-card__check"
        :aria-label="t('sync.downloaded')"
      >
        <i
          class="ti ti-check"
          aria-hidden="true"
        />
      </div>

      <div
        v-if="showDownloadControls && isBusy"
        class="album-collection-card__progress"
      >
        <span class="album-collection-card__progress-value">{{ progress }}%</span>
        <span class="album-collection-card__progress-label">{{ progressLabel }}</span>
        <div
          class="album-collection-card__track"
          aria-hidden="true"
        >
          <div
            class="album-collection-card__fill"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>

      <div class="album-collection-card__hover">
        <button
          v-if="!isBusy"
          type="button"
          class="album-collection-card__play"
          :aria-label="t('albums.openCollection', { name: collection.name })"
          @click="onOpen"
        >
          <span class="album-collection-card__play-btn">
            <i
              class="ti ti-player-play"
              aria-hidden="true"
            />
          </span>
        </button>

        <button
          v-if="showDownloadControls && canRemove"
          type="button"
          class="album-collection-card__remove"
          :aria-label="t('sync.remove')"
          @click.stop="onRemove"
        >
          <i
            class="ti ti-trash"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="showPersistentDownload"
        class="album-collection-card__footer album-collection-card__footer--persistent"
      >
        <button
          type="button"
          class="album-collection-card__action"
          :class="{
            'album-collection-card__action--cancel': isBusy,
            'album-collection-card__action--retry': status === 'error',
          }"
          :aria-label="
            isBusy
              ? t('sync.cancel')
              : status === 'error'
                ? t('sync.retry')
                : t('sync.downloadOffline')
          "
          @click="onDownload"
        >
          <i
            class="ti"
            :class="{
              'ti-download': status === 'idle',
              'ti-x': isBusy,
              'ti-refresh': status === 'error',
            }"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div class="album-collection-card__body">
      <h3 class="album-collection-card__name">
        {{ collection.name }}
      </h3>
      <p
        v-if="collection.subtitle"
        class="album-collection-card__subtitle"
      >
        {{ collection.subtitle }}
      </p>
      <p
        v-if="collection.trackCount != null"
        class="album-collection-card__meta"
      >
        {{ t('albums.trackCount', { count: collection.trackCount }) }}
      </p>
    </div>
  </article>
</template>

<style scoped lang="scss">
.album-collection-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.album-collection-card__cover {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--ds-color-primary) 35%, #111), #1a1a1a);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 160ms ease,
    border-color 160ms ease;

  .album-collection-card:hover & {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  }
}

.album-collection-card__cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.album-collection-card__fallback {
  font-size: 2.5rem;
  color: color-mix(in srgb, #fff 70%, transparent);
}

/* Coletânea custom: gradiente de marca */
.album-collection-card__cover--custom {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--ds-color-primary, #2196f3) 28%, transparent),
      rgba(0, 0, 0, 0.4)
    ),
    color-mix(in srgb, var(--ds-color-surface-card, #242424) 88%, #000);
}

.album-collection-card__cover--custom .album-collection-card__fallback {
  font-size: 2rem;
}

.album-collection-card__check {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 2;
  display: flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--ds-color-secondary, #78d6d2);
  color: var(--ds-color-on-secondary, #003736);
  box-shadow: 0 8px 16px rgb(0 0 0 / 35%);

  .ti {
    font-size: 1.25rem;
    line-height: 1;
    font-weight: 700;
    color: inherit;
  }
}

.album-collection-card__progress {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 1rem 1rem 3.25rem;
  background: rgb(0 0 0 / 55%);
  color: #fff;
}

.album-collection-card__progress-value {
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
}

.album-collection-card__progress-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  opacity: 0.85;
}

.album-collection-card__track {
  width: 70%;
  height: 4px;
  margin-top: 0.35rem;
  overflow: hidden;
  border-radius: 9999px;
  background: rgb(255 255 255 / 20%);
}

.album-collection-card__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ds-color-primary);
  transition: width 200ms ease;
}

.album-collection-card__hover {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  background: rgb(0 0 0 / 45%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;

  .album-collection-card:hover & {
    opacity: 1;
    pointer-events: auto;
  }
}

.album-collection-card--pending .album-collection-card__hover {
  /* deixa o rodapé persistente acima do overlay de hover */
  bottom: 3.1rem;
}

.album-collection-card__play {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.album-collection-card__play-btn {
  display: inline-flex;
  width: 3.25rem;
  height: 3.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 92%, transparent);
  color: var(--ds-color-on-primary, #003258);
  box-shadow: 0 12px 28px rgb(0 0 0 / 40%);
  transform: scale(0.88);
  transition: transform 180ms ease;

  .album-collection-card:hover & {
    transform: scale(1);
  }

  .ti {
    font-size: 1.6rem;
    line-height: 1;
    color: inherit;
  }
}

.album-collection-card__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  background: color-mix(in srgb, #000 55%, transparent);
  border-top: 1px solid color-mix(in srgb, #fff 12%, transparent);

  &--persistent {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    z-index: 4;
  }
}

.album-collection-card__remove {
  position: absolute;
  right: 0.45rem;
  bottom: 0.45rem;
  z-index: 4;
  display: inline-flex;
  width: 1.35rem;
  height: 1.35rem;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: rgb(0 0 0 / 45%);
  color: rgb(255 255 255 / 78%);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;

  .ti {
    font-size: 0.75rem;
    line-height: 1;
    color: inherit;
  }

  &:hover {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 72%, #000);
    color: #fff;
    transform: scale(1.08);
  }
}

.album-collection-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 90%, transparent);
  color: var(--ds-color-on-primary, #003258);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;

  .ti {
    font-size: 1.15rem;
    line-height: 1;
    color: inherit;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
    filter: brightness(1.08);
  }

  &--cancel,
  &--retry {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 82%, transparent);
    color: #fff;
  }
}

.album-collection-card--busy .album-collection-card__hover {
  background: transparent;
  opacity: 0;
  pointer-events: none;
}

.album-collection-card__body {
  padding: 0 0.15rem;
}

.album-collection-card__name {
  margin: 0;
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-collection-card__subtitle,
.album-collection-card__meta {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  color: var(--ds-color-on-surface-variant);
}
</style>
