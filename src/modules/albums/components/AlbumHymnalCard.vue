<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import type { LibraryAlbum } from '@modules/sync/types/library'

import type { AlbumCollection } from '../types/albums'

const props = defineProps<{
  collection: AlbumCollection
  libraryAlbum?: LibraryAlbum | null
  showDownloadControls?: boolean
  /** Álbum desativado (músicas apagadas na busca; o seletor pula). */
  disabled?: boolean
  /** Mostra o botão de desativar/ativar (o card do YouTube não tem). */
  canDisable?: boolean
}>()

const emit = defineEmits<{
  open: []
  download: []
  cancel: []
  remove: []
  'toggle-disabled': []
}>()

const { t } = useI18n()

const status = computed(() => props.libraryAlbum?.status ?? 'idle')
// v8 ignore next -- remap V8: ambos os lados do ?? exercidos (progress presente e null)
const progress = computed(() => props.libraryAlbum?.progress ?? 0)
const isDownloaded = computed(() => status.value === 'downloaded')

const displayName = computed(() => {
  if (props.collection.id === 'hymnal_1996') return t('sync.hymnal.edition1996Name')
  return props.collection.name
})

const subtitle = computed(() => {
  if (status.value === 'downloading') {
    return t(props.libraryAlbum?.progressText || 'sync.progress.downloading')
  }

  const songCount = props.libraryAlbum?.songCount ?? props.collection.trackCount
  if (songCount != null) {
    const key =
      props.collection.id === 'hymnal_1996'
        ? 'sync.hymnal.edition1996Subtitle'
        : 'sync.hymnal.officialSubtitle'
    return t(key, { count: songCount })
  }

  return props.collection.subtitle || null
})

const coverIcon = computed(() =>
  props.collection.id === 'hymnal_1996'
    ? 'ti-history'
    : props.collection.id === 'youtube_cpb'
      ? 'ti-brand-youtube'
      : 'ti-book-2',
)

const coverSrc = computed(() => props.collection.coverUrl || '')

const coverFailed = ref(false)
watch(coverSrc, () => {
  coverFailed.value = false
})
</script>

<template>
  <GlassCard
    class="album-hymnal-card"
    :class="{ 'album-hymnal-card--downloaded': isDownloaded, 'album-hymnal-card--disabled': canDisable && disabled }"
    :padding="false"
  >
    <div class="album-hymnal-card__main">
      <button
        type="button"
        class="album-hymnal-card__cover-btn"
        tabindex="-1"
        aria-hidden="true"
        @click="emit('open')"
      >
        <div
          class="album-hymnal-card__cover"
          :class="{
            'album-hymnal-card__cover--muted':
              showDownloadControls && (status === 'idle' || status === 'error'),
          }"
        >
          <img
            v-if="coverSrc && !coverFailed"
            class="album-hymnal-card__cover-img"
            :src="coverSrc"
            alt=""
            @error="coverFailed = true"
          >
          <i
            v-else
            class="ti album-hymnal-card__fallback-icon"
            :class="coverIcon"
            aria-hidden="true"
          />
        </div>
      </button>

      <div class="album-hymnal-card__content">
        <button
          type="button"
          class="album-hymnal-card__open"
          :aria-label="displayName"
          @click="emit('open')"
        >
          <h4 class="album-hymnal-card__name">
            {{ displayName }}
          </h4>

          <template v-if="showDownloadControls && status === 'downloading'">
            <div class="album-hymnal-card__progress-meta">
              <span>{{ subtitle }}</span>
              <span>{{ progress }}%</span>
            </div>
            <div
              class="album-hymnal-card__track"
              aria-hidden="true"
            >
              <div
                class="album-hymnal-card__fill"
                :style="{ width: `${progress}%` }"
              />
            </div>
          </template>

          <p
            v-else-if="subtitle"
            class="album-hymnal-card__subtitle"
          >
            {{ subtitle }}
          </p>
          <span v-if="canDisable && disabled" class="album-card-disabled-label">
            <i class="ti ti-eye-off" aria-hidden="true" />
            {{ t('albums.disabledAlbums.badge') }}
          </span>
        </button>

        <div
          v-if="showDownloadControls || canDisable"
          class="album-hymnal-card__footer"
        >
        <div
          v-if="showDownloadControls && isDownloaded"
          class="album-hymnal-card__badge"
        >
          <i
            class="ti ti-check"
            aria-hidden="true"
          />
          <span>{{ t('sync.downloaded') }}</span>
        </div>

        <div
          v-if="showDownloadControls"
          class="album-hymnal-card__actions"
        >
          <button
            v-if="status === 'downloading'"
            type="button"
            class="album-hymnal-card__cancel"
            @click="emit('cancel')"
          >
            <i
              class="ti ti-x"
              aria-hidden="true"
            />
            {{ t('sync.cancel') }}
          </button>

          <button
            v-else-if="status === 'idle'"
            type="button"
            class="album-hymnal-card__action album-hymnal-card__action--download"
            @click="emit('download')"
          >
            <i
              class="ti ti-download"
              aria-hidden="true"
            />
            {{ t('sync.downloadOffline') }}
          </button>

          <button
            v-else-if="status === 'downloaded'"
            type="button"
            class="album-hymnal-card__action album-hymnal-card__action--remove"
            @click="emit('remove')"
          >
            <i
              class="ti ti-trash"
              aria-hidden="true"
            />
            {{ t('sync.remove') }}
          </button>

          <!-- v8 ignore next 3 -- remap V8 do else-if: false side exercido pelo status downloaded -->
          <button
            v-else-if="status === 'error'"
            type="button"
            class="album-hymnal-card__action album-hymnal-card__action--retry"
            @click="emit('download')"
          >
            <i
              class="ti ti-refresh"
              aria-hidden="true"
            />
            {{ t('sync.retry') }}
          </button>
        </div>

        <button
          v-if="canDisable"
          type="button"
          class="album-card-disable album-hymnal-card__disable"
          :aria-pressed="disabled ? 'true' : 'false'"
          :title="t(disabled ? 'albums.disabledAlbums.enable' : 'albums.disabledAlbums.disable')"
          :aria-label="t(disabled ? 'albums.disabledAlbums.enable' : 'albums.disabledAlbums.disable')"
          @click.stop="emit('toggle-disabled')"
        >
          <i class="ti" :class="disabled ? 'ti-eye-off' : 'ti-eye'" aria-hidden="true" />
        </button>
        </div>
      </div>
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.album-hymnal-card {
  position: relative;
  display: block;
  height: 100%;
  box-sizing: border-box;
  padding: 0.95rem 1rem;
  overflow: hidden;
  border-radius: 1rem 0 1rem 0 !important;
  transition:
    background-color 300ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 300ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);
  }
}

/* Capa compacta à esquerda; texto+botões empilhados à direita */
.album-hymnal-card__main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
}

.album-hymnal-card__cover-btn {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.album-hymnal-card__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.35rem;
}

.album-hymnal-card__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.album-hymnal-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 20%, transparent);
  background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 20%, transparent);
  color: var(--ds-color-secondary, #78d6d2);
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  animation: album-badge-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

  .ti {
    font-size: 0.8rem;
    line-height: 1;
    font-weight: 700;
  }
}

.album-hymnal-card__open {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 0.1rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.album-hymnal-card__cover {
  position: relative;
  display: flex;
  width: 3.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.55rem 0 0.55rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: var(--ds-color-surface-container-high, #2a2a2a);
  box-shadow: 0 6px 14px rgb(0 0 0 / 28%);

  .album-hymnal-card__cover-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &--muted {
    border-color: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
    background: color-mix(
      in srgb,
      var(--ds-color-surface-container-high, #2a2a2a) 50%,
      transparent
    );
    box-shadow: none;

    .album-hymnal-card__fallback-icon {
      color: var(--ds-color-on-surface-variant);
    }
  }
}

.album-hymnal-card__fallback-icon {
  font-size: 1.6rem;
  color: var(--ds-color-primary);
  line-height: 1;
}

.album-hymnal-card__name {
  margin: 0;
  overflow: hidden;
  color: var(--ds-color-on-surface);
  /* Mesmo tamanho/peso dos títulos das coletâneas */
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.album-hymnal-card__subtitle {
  margin: 0;
  overflow: hidden;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  line-height: 1.3;
  /* CPB: duas linhas via \\n no i18n; demais ficam em uma */
  white-space: pre-line;
}

.album-hymnal-card__progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
  color: var(--ds-color-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.album-hymnal-card__track {
  height: 5px;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
}

.album-hymnal-card__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ds-color-primary);
  transition: width 200ms ease;
}

.album-hymnal-card__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.album-hymnal-card__action,
.album-hymnal-card__cancel {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 1.85rem;
  padding: 0 0.7rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
  transition:
    background-color 200ms ease,
    color 200ms ease,
    border-color 200ms ease;

  .ti {
    font-size: 1rem;
    line-height: 1;
  }
}

.album-hymnal-card__action--download {
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  color: var(--ds-color-primary);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
  }
}

.album-hymnal-card__action--remove,
.album-hymnal-card__cancel {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);

  &:hover {
    color: var(--ds-color-error, #ffb4ab);
  }
}

.album-hymnal-card__action--retry {
  border: 1px solid color-mix(in srgb, var(--ds-color-error, #ffb4ab) 35%, transparent);
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 12%, transparent);
  color: var(--ds-color-error, #ffb4ab);
}

@keyframes album-badge-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

@media (max-width: 1280px) {
  .album-hymnal-card {
    padding: 0.85rem 0.9rem;
  }

  .album-hymnal-card__main {
    gap: 0.7rem;
  }

  .album-hymnal-card__cover {
    width: 2.85rem;
    height: 2.85rem;
  }

  .album-hymnal-card__fallback-icon {
    font-size: 1.35rem;
  }
}

/* Desativar álbum (paridade Classic): sempre visível, discreto. */
.album-card-disable {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-elevated) 85%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.album-card-disable:hover,
.album-card-disable:focus-visible {
  opacity: 1;
  transform: scale(1.06);
}

.album-card-disable[aria-pressed='true'] {
  border-color: var(--ds-color-primary);
  color: var(--ds-color-primary);
  opacity: 1;
}

.album-card-disabled-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  width: fit-content;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--ds-color-outline-strong);
  font-size: 0.75rem;
  font-weight: 600;
}

.album-hymnal-card--disabled .album-hymnal-card__cover {
  opacity: 0.35;
  filter: grayscale(1);
}
</style>
