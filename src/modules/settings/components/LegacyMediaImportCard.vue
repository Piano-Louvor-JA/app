<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

import { useLegacyMediaImportStore } from '../stores/useLegacyMediaImportStore'

const { t } = useI18n()

/**
 * Windows: procura a instalação do Louvor JA legado ou importa uma pasta
 * escolhida (Electron reporta platform === 'win32' em qualquer arch).
 * Linux: importa a pasta extraída do arquivo de mídias baixado no site.
 * macOS: o card não monta.
 *
 * O card só mostra a importação: quem a conduz é a store, que continua
 * viva ao sair da página — ao voltar, o card mostra o estado atual.
 */
const isWindows = computed(() => getDesktopBridge()?.platform === 'win32')
const isLinux = computed(() => getDesktopBridge()?.platform === 'linux')
const supported = computed(() => isWindows.value || isLinux.value)

const canImport = computed(() => {
  const bridge = getDesktopBridge()
  return Boolean(supported.value && bridge?.legacyMedia)
})
const canControl = computed(() => Boolean(getDesktopBridge()?.legacyMedia?.pause))
const canPickArchive = computed(() => Boolean(getDesktopBridge()?.legacyMedia?.pickArchive))

const importStore = useLegacyMediaImportStore()
const { phase, analysis, importResult, progress, reconcileMarked, paused, errorKey, busy, progressPercent } =
  storeToRefs(importStore)

/** Texto do botão enquanto trabalha (Windows: busca; Linux: pasta escolhida). */
const busyLabel = computed(() =>
  phase.value === 'analyzing'
    ? t('settings.general.legacyMediaAnalyzing')
    : phase.value === 'importing'
      ? t('settings.general.legacyMediaImporting')
      : t('settings.general.legacyMediaReconciling'),
)

/* v8 ignore start -- mb interpolado só dentro do bloco analysis.found */
const missingMb = computed(() =>
  analysis.value ? Math.round(analysis.value.missingBytes / (1024 * 1024)) : 0,
)
/* v8 ignore stop */

function runImport() {
  if (!supported.value) return
  void importStore.runImport()
}

function runManualImport() {
  if (!supported.value) return
  void importStore.runManualImport()
}

function runArchiveImport() {
  if (!supported.value) return
  void importStore.runArchiveImport()
}

/** Bytes lidos do arquivo compactado, em GB (ou MB abaixo de 1 GB). */
function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/** Linux: o botão principal (arquivo) mostra o andamento. */
const archiveIsPrimary = computed(() => isLinux.value && canPickArchive.value)

const pauseImport = () => importStore.pause()
const resumeImport = () => importStore.resume()
const stopImport = () => importStore.stop()
</script>

<template>
  <!-- macOS: não renderiza nada (Geral permanece intacta). -->
  <GlassCard
    v-if="supported"
    class="general-settings__card"
    elevated
    data-test="legacy-media-card"
  >
    <div
      class="general-settings__accent"
      aria-hidden="true"
    />

    <div class="general-settings__header">
      <div class="general-settings__heading">
        <i
          class="ti ti-folder-symlink general-settings__icon"
          aria-hidden="true"
        />
        <h3 class="general-settings__title">
          {{ t('settings.general.legacyMediaTitle') }}
        </h3>
      </div>
    </div>

    <p class="general-settings__hint">
      {{ t(isLinux ? 'settings.general.legacyMediaHintLinux' : 'settings.general.legacyMediaHint') }}
    </p>

    <div class="legacy-media__actions">
      <button
        v-if="isWindows"
        type="button"
        class="general-settings__btn general-settings__btn--primary"
        data-test="legacy-media-import-button"
        :disabled="busy || !canImport"
        @click="runImport()"
      >
        <i
          class="ti"
          :class="busy ? 'ti-loader-2 general-settings__spin' : 'ti-download'"
          aria-hidden="true"
        />
        {{
          phase === 'analyzing'
            ? t('settings.general.legacyMediaAnalyzing')
            : phase === 'importing'
              ? t('settings.general.legacyMediaImporting')
              : phase === 'reconciling'
                ? t('settings.general.legacyMediaReconciling')
                : t('settings.general.legacyMediaAction')
        }}
      </button>

      <button
        v-if="canPickArchive"
        type="button"
        class="general-settings__btn"
        :class="archiveIsPrimary ? 'general-settings__btn--primary' : 'general-settings__btn--secondary'"
        data-test="legacy-media-pick-archive-button"
        :disabled="busy || !canImport"
        @click="runArchiveImport"
      >
        <i
          class="ti"
          :class="archiveIsPrimary && busy ? 'ti-loader-2 general-settings__spin' : 'ti-file-zip'"
          aria-hidden="true"
        />
        {{ archiveIsPrimary && busy ? busyLabel : t('settings.general.legacyMediaPickArchive') }}
      </button>

      <button
        type="button"
        class="general-settings__btn"
        :class="isLinux && !archiveIsPrimary ? 'general-settings__btn--primary' : 'general-settings__btn--secondary'"
        data-test="legacy-media-pick-folder-button"
        :disabled="busy || !canImport"
        @click="runManualImport"
      >
        <i
          class="ti"
          :class="isLinux && !archiveIsPrimary && busy ? 'ti-loader-2 general-settings__spin' : 'ti-folder-open'"
          aria-hidden="true"
        />
        {{
          isLinux
            ? busy && !archiveIsPrimary
              ? busyLabel
              : t('settings.general.legacyMediaPickFolderLinux')
            : t('settings.general.legacyMediaPickFolder')
        }}
      </button>
      <!-- Porcentagem ao lado do botão enquanto importa. -->
      <span
        v-if="(phase === 'importing' || phase === 'reconciling') && progress"
        class="legacy-media__percent"
        data-test="legacy-media-percent"
      >{{ progressPercent }}%</span>
      <template v-if="phase === 'importing' && canControl">
        <button
          v-if="!paused"
          type="button"
          class="general-settings__btn general-settings__btn--secondary"
          data-test="legacy-media-pause"
          @click="pauseImport"
        >
          <i
            class="ti ti-player-pause"
            aria-hidden="true"
          />
          {{ t('settings.general.legacyMediaPause') }}
        </button>
        <button
          v-else
          type="button"
          class="general-settings__btn general-settings__btn--primary"
          data-test="legacy-media-resume"
          @click="resumeImport"
        >
          <i
            class="ti ti-player-play"
            aria-hidden="true"
          />
          {{ t('settings.general.legacyMediaResume') }}
        </button>
        <button
          type="button"
          class="general-settings__btn general-settings__btn--secondary"
          data-test="legacy-media-stop"
          @click="stopImport"
        >
          <i
            class="ti ti-player-stop"
            aria-hidden="true"
          />
          {{ t('settings.general.legacyMediaStop') }}
        </button>
      </template>
    </div>

    <p class="general-settings__hint general-settings__hint--sub">
      {{ t(isLinux ? 'settings.general.legacyMediaPickHintLinux' : 'settings.general.legacyMediaPickHint') }}
    </p>

    <div
      v-if="(phase === 'importing' || phase === 'reconciling') && progress"
      class="legacy-media__progress"
      data-test="legacy-media-progress"
    >
      <div
        class="legacy-media__bar"
        role="progressbar"
        :aria-valuenow="progressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="legacy-media__bar-fill"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
      <p class="legacy-media__progress-text">
        {{
          phase === 'reconciling'
            ? t('settings.general.legacyMediaReconcileProgress', {
                current: progress.current,
                total: progress.total,
              })
            : progress.unit === 'bytes'
              ? t(paused ? 'settings.general.legacyMediaPausedBytes' : 'settings.general.legacyMediaProgressBytes', {
                  current: formatBytes(progress.current),
                  total: formatBytes(progress.total),
                })
              : t(paused ? 'settings.general.legacyMediaPaused' : 'settings.general.legacyMediaProgress', {
                  current: progress.current,
                  total: progress.total,
                })
        }}
      </p>
      <p
        v-if="phase === 'importing' && progress.imported != null"
        class="legacy-media__live"
        data-test="legacy-media-live"
      >
        {{
          t('settings.general.legacyMediaLiveCounts', {
            imported: progress.imported,
            skipped: progress.skipped ?? 0,
          })
        }}
      </p>
      <p class="legacy-media__file">
        {{ progress.relativePath }}
      </p>
    </div>

    <p
      v-if="phase === 'analyzing'"
      class="general-settings__status general-settings__status--info"
      data-test="legacy-media-analyzing"
    >
      <i
        class="ti ti-loader-2 general-settings__spin"
        aria-hidden="true"
      />
      {{ t('settings.general.legacyMediaAnalyzingHint') }}
    </p>

    <template v-if="analysis?.found && (phase === 'importing' || phase === 'reconciling' || phase === 'done')">
      <p class="legacy-media__path">
        {{ analysis.configDir }}
        <span v-if="analysis.lang"> · {{ analysis.lang.toUpperCase() }}</span>
      </p>
      <p class="general-settings__status general-settings__status--info">
        <i
          class="ti ti-info-circle"
          aria-hidden="true"
        />
        {{
          analysis.archive
            ? t('settings.general.legacyMediaArchiveSummary', { size: formatBytes(analysis.totalBytes) })
            : t('settings.general.legacyMediaScanSummary', {
              scanned: analysis.scanned,
              missing: analysis.missing,
              present: analysis.present,
              mb: missingMb,
            })
        }}
      </p>
    </template>

    <p
      v-if="phase === 'done' && importResult"
      class="general-settings__status general-settings__status--success"
      data-test="legacy-media-done"
    >
      <i
        class="ti ti-circle-check"
        aria-hidden="true"
      />
      <template v-if="importResult.reason === 'nothing-to-import'">
        {{ t('settings.general.legacyMediaUpToDate') }}
      </template>
      <template v-else-if="importResult.reason === 'cancelled'">
        {{ t('settings.general.legacyMediaCancelled', { imported: importResult.imported }) }}
      </template>
      <template v-else>
        {{
          t('settings.general.legacyMediaImported', {
            imported: importResult.imported,
            skipped: importResult.skipped,
            failed: importResult.failed,
          })
        }}
      </template>
      <span v-if="reconcileMarked > 0">
        {{
          t('settings.general.legacyMediaReconciled', {
            marked: reconcileMarked,
          })
        }}
      </span>
    </p>

    <p
      v-if="phase === 'error' && errorKey"
      class="general-settings__status general-settings__status--error"
      data-test="legacy-media-error"
    >
      <i
        class="ti ti-alert-circle"
        aria-hidden="true"
      />
      {{ t(errorKey) }}
    </p>
  </GlassCard>
</template>

<style scoped lang="scss">
.legacy-media__live {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--ds-color-primary);
}

.legacy-media__percent {
  align-self: center;
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ds-color-primary);
}

.general-settings__card {
  position: relative;
  overflow: hidden;
}

.general-settings__accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--ds-color-primary);
  opacity: 0.8;
}

.general-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.general-settings__heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.general-settings__icon {
  font-size: 28px;
  line-height: 1;
  color: var(--ds-color-primary);
}

.general-settings__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.25rem;
  font-weight: 700;
}

.general-settings__hint {
  margin: 0 0 1rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  line-height: 1.5;
  opacity: 0.85;
}

.general-settings__hint--sub {
  margin: 0.75rem 0 0;
}

.legacy-media__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.general-settings__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: var(--ds-radius-full);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  transition:
    background-color 200ms ease,
    transform 150ms ease,
    opacity 150ms ease;

  .ti {
    font-size: 20px;
    line-height: 1;
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.general-settings__btn--primary {
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }
}

.general-settings__btn--secondary {
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  }
}

.general-settings__status {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  line-height: 1.4;

  .ti {
    margin-top: 0.1rem;
    font-size: 1rem;
  }
}

.general-settings__status--success {
  color: var(--ds-color-primary);
}

.general-settings__status--error {
  color: rgb(var(--v-theme-error));
}

.general-settings__status--info {
  color: var(--ds-color-on-surface-variant);
}

.legacy-media__progress {
  margin-top: 1rem;
}

.legacy-media__bar {
  width: 100%;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
}

.legacy-media__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ds-color-primary);
  transition: width 160ms ease;
}

.legacy-media__progress-text {
  margin: 0.5rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8125rem;
}

.legacy-media__file {
  margin: 0.25rem 0 0;
  overflow: hidden;
  color: var(--ds-color-on-surface-variant);
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}

.legacy-media__path {
  margin: 0.75rem 0 0;
  overflow: hidden;
  color: var(--ds-color-on-surface-variant);
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

.general-settings__spin {
  animation: legacy-media-spin 0.9s linear infinite;
}

@keyframes legacy-media-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
