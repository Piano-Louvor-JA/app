<script setup lang="ts">
import { useLocalLibraryStore } from "@modules/sync/stores/useLocalLibraryStore";
import { isDesktopApp } from "@shared/services/desktop-bridge";
import {
	deleteTrackMedia,
	downloadTrackMedia,
	isTrackMediaDownloaded,
} from "@shared/services/track-media";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

/**
 * Controles reutilizáveis de faixa: Cantado / Playback / Sem áudio / Letra.
 * Usado em Álbuns, Liturgia e qualquer lista de músicas.
 */
const props = withDefaults(
	defineProps<{
		hasInstrumental: boolean;
		busy?: boolean;
		variant?: "plain" | "contained";
		/** Quando informado (desktop), exibe baixar/excluir offline. */
		musicId?: number | null;
		/** Nome da faixa para o diálogo de confirmação. */
		trackName?: string;
		/** Controla a visibilidade do botão excluir (hover da linha). */
		rowHovered?: boolean;
		/** Exibe o botão de apagar mídia offline (Álbuns sim; Liturgia não). */
		allowOfflineRemove?: boolean;
	}>(),
	{
		busy: false,
		variant: "plain",
		musicId: null,
		trackName: "",
		rowHovered: false,
		allowOfflineRemove: true,
	},
);

const emit = defineEmits<{
	sung: [];
	instrumental: [];
	slides: [];
	lyric: [];
	/** Progresso do download individual (null = não está baixando). */
	downloadProgress: [progress: number | null];
}>();

const { t } = useI18n();
const libraryStore = useLocalLibraryStore();

/** Oculto por enquanto — reative para voltar o botão de letra nas listagens. */
const SHOW_LYRIC_ACTION = false;

type OfflineStatus = "idle" | "downloaded" | "downloading" | "checking";

const offlineStatus = ref<OfflineStatus>("idle");
const downloadProgress = ref(0);
const cancelRequested = ref(false);
const confirmRemoveOpen = ref(false);

const showOfflineControls = computed(
	() => isDesktopApp() && props.musicId != null && props.musicId > 0,
);

const isOfflineBusy = computed(
	() =>
		offlineStatus.value === "downloading" || offlineStatus.value === "checking",
);

const confirmTrackLabel = computed(
	() => props.trackName.trim() || t("media.actions.thisTrack"),
);

function emitDownloadProgress(progress: number | null) {
	emit("downloadProgress", progress);
}

async function refreshOfflineStatus() {
	if (!showOfflineControls.value || props.musicId == null) {
		offlineStatus.value = "idle";
		return;
	}

	offlineStatus.value = "checking";
	try {
		const downloaded = await isTrackMediaDownloaded(props.musicId);
		offlineStatus.value = downloaded ? "downloaded" : "idle";
	} catch {
		offlineStatus.value = "idle";
	}
}

function requestRemove() {
	confirmRemoveOpen.value = true;
}

function dismissRemove() {
	confirmRemoveOpen.value = false;
}

async function confirmRemove() {
	if (props.musicId == null) return;
	confirmRemoveOpen.value = false;
	await deleteTrackMedia(props.musicId);
	offlineStatus.value = "idle";
	downloadProgress.value = 0;
	emitDownloadProgress(null);
	void libraryStore.reconcileAlbumsForMusic(props.musicId);
}

async function onOfflineAction() {
	if (!showOfflineControls.value || props.musicId == null) return;
	if (offlineStatus.value === "downloading") {
		cancelRequested.value = true;
		offlineStatus.value = "idle";
		downloadProgress.value = 0;
		emitDownloadProgress(null);
		return;
	}

	if (offlineStatus.value === "downloaded") {
		requestRemove();
		return;
	}

	cancelRequested.value = false;
	offlineStatus.value = "downloading";
	downloadProgress.value = 0;
	emitDownloadProgress(0);

	const musicId = props.musicId;
	const result = await downloadTrackMedia(musicId, {
		onProgress: (percent) => {
			if (cancelRequested.value) return;
			downloadProgress.value = percent;
			emitDownloadProgress(percent);
		},
		shouldAbort: () => cancelRequested.value,
	});

	if (cancelRequested.value || result.status === "idle") {
		cancelRequested.value = false;
		offlineStatus.value = "idle";
		downloadProgress.value = 0;
		emitDownloadProgress(null);
		if (result.status === "idle" && result.reason !== "cancelled") {
			await refreshOfflineStatus();
		}
		return;
	}

	cancelRequested.value = false;

	if (result.status === "downloaded") {
		offlineStatus.value = "downloaded";
		downloadProgress.value = 100;
		emitDownloadProgress(null);
		void libraryStore.reconcileAlbumsForMusic(musicId);
		return;
	}

	offlineStatus.value = "idle";
	downloadProgress.value = 0;
	emitDownloadProgress(null);
}

onMounted(() => {
	void refreshOfflineStatus();
});

watch(
	() => props.musicId,
	() => {
		void refreshOfflineStatus();
	},
);
</script>

<template>
  <div
    class="music-track-actions"
    :class="`music-track-actions--${variant}`"
  >
    <button
      type="button"
      class="music-track-actions__btn"
      :disabled="busy"
      :title="t('media.actions.sung')"
      :aria-label="t('media.actions.sung')"
      @click.stop="emit('sung')"
    >
      <i
        class="ti ti-player-play"
        aria-hidden="true"
      />
    </button>

    <button
      type="button"
      class="music-track-actions__btn"
      :disabled="busy || !hasInstrumental"
      :title="t('media.actions.instrumental')"
      :aria-label="t('media.actions.instrumental')"
      @click.stop="emit('instrumental')"
    >
      <i
        class="ti ti-piano"
        aria-hidden="true"
      />
    </button>

    <button
      type="button"
      class="music-track-actions__btn"
      :disabled="busy"
      :title="t('media.actions.slides')"
      :aria-label="t('media.actions.slides')"
      @click.stop="emit('slides')"
    >
      <i
        class="ti ti-volume-off"
        aria-hidden="true"
      />
    </button>

    <button
      v-if="SHOW_LYRIC_ACTION"
      type="button"
      class="music-track-actions__btn"
      :disabled="busy"
      :title="t('media.actions.lyric')"
      :aria-label="t('media.actions.lyric')"
      @click.stop="emit('lyric')"
    >
      <i
        class="ti ti-file-text"
        aria-hidden="true"
      />
    </button>

    <template v-if="showOfflineControls">
      <span
        v-if="offlineStatus === 'downloaded'"
        class="music-track-actions__check"
        :title="t('media.actions.downloaded')"
        :aria-label="t('media.actions.downloaded')"
      >
        <i
          class="ti ti-check"
          aria-hidden="true"
        />
      </span>

      <button
        v-if="offlineStatus === 'downloaded' && allowOfflineRemove"
        type="button"
        class="music-track-actions__btn music-track-actions__btn--danger music-track-actions__btn--remove"
        :class="{ 'music-track-actions__btn--remove-visible': rowHovered }"
        :disabled="busy"
        :title="t('media.actions.removeOffline')"
        :aria-label="t('media.actions.removeOffline')"
        @click.stop="requestRemove"
      >
        <i
          class="ti ti-trash"
          aria-hidden="true"
        />
      </button>

      <button
        v-else-if="offlineStatus !== 'downloaded'"
        type="button"
        class="music-track-actions__btn"
        :class="{
          'music-track-actions__btn--danger': offlineStatus === 'downloading',
        }"
        :disabled="busy || offlineStatus === 'checking'"
        :title="
          offlineStatus === 'downloading'
            ? `${t('media.actions.cancelDownload')} (${downloadProgress}%)`
            : t('media.actions.downloadOffline')
        "
        :aria-label="
          offlineStatus === 'downloading'
            ? `${t('media.actions.cancelDownload')} (${downloadProgress}%)`
            : t('media.actions.downloadOffline')
        "
        @click.stop="onOfflineAction"
      >
        <i
          v-if="offlineStatus === 'downloading'"
          class="ti ti-x"
          aria-hidden="true"
        />
        <i
          v-else-if="isOfflineBusy"
          class="ti ti-loader-2 music-track-actions__spin"
          aria-hidden="true"
        />
        <i
          v-else
          class="ti ti-download"
          aria-hidden="true"
        />
      </button>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="confirmRemoveOpen"
      class="music-track-confirm"
      role="dialog"
      aria-modal="true"
      :aria-label="t('media.actions.removeConfirmTitle')"
      @click.stop
    >
      <div
        class="music-track-confirm__backdrop"
        aria-hidden="true"
      />
      <div class="music-track-confirm__panel">
        <h2 class="music-track-confirm__title">
          {{ t('media.actions.removeConfirmTitle') }}
        </h2>
        <p class="music-track-confirm__text">
          {{
            t('media.actions.removeConfirmText', {
              name: confirmTrackLabel,
            })
          }}
        </p>
        <div class="music-track-confirm__actions">
          <button
            type="button"
            class="music-track-confirm__btn"
            @click="dismissRemove"
          >
            {{ t('media.actions.removeConfirmNo') }}
          </button>
          <button
            type="button"
            class="music-track-confirm__btn music-track-confirm__btn--danger"
            @click="confirmRemove"
          >
            {{ t('media.actions.removeConfirmYes') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.music-track-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.music-track-actions__btn {
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    transform 140ms ease,
    opacity 140ms ease;

  .ti {
    font-size: 1.35rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    transform: scale(1.06);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &--danger {
    color: var(--ds-color-error, #ffb4ab);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
    }
  }

  &--remove {
    opacity: 0;
    pointer-events: none;

    &-visible {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.music-track-actions__check {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, #2ecc71 22%, transparent);
  color: #2ecc71;

  .ti {
    font-size: 1.05rem;
    line-height: 1;
    font-weight: 700;
  }
}

.music-track-actions__spin {
  animation: music-track-spin 0.8s linear infinite;
}

@keyframes music-track-spin {
  to {
    transform: rotate(360deg);
  }
}

.music-track-actions--contained {
  .music-track-actions__btn {
    background: var(--ds-color-surface-container-high);
    color: var(--ds-color-on-surface-variant);

    &:first-child {
      color: var(--ds-color-primary);
    }

    &:hover:not(:disabled) {
      background: var(--ds-color-primary);
      color: var(--ds-color-on-primary);
    }

    &--danger {
      color: var(--ds-color-error, #ffb4ab);

      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 22%, transparent);
        color: var(--ds-color-error, #ffb4ab);
      }
    }

    &--remove {
      opacity: 0;

      &.music-track-actions__btn--remove-visible {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}

.music-track-confirm {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.music-track-confirm__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(0 0 0 / 45%);
}

.music-track-confirm__panel {
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

.music-track-confirm__title {
  margin: 0 0 0.75rem;
  color: var(--ds-color-on-surface);
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

.music-track-confirm__text {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
}

.music-track-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.music-track-confirm__btn {
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
</style>
