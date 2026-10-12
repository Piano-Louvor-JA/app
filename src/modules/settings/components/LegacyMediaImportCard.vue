<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type {
  LegacyMediaAnalyzeResult,
  LegacyMediaImportProgress,
  LegacyMediaImportResult,
} from '@shared/types/desktop-bridge'
import { useLocalLibraryStore } from '@modules/sync/stores/useLocalLibraryStore'

const { t } = useI18n()
const libraryStore = useLocalLibraryStore()

/**
 * Somente Windows (Electron reporta platform === 'win32' em qualquer arch).
 * No Linux/macOS o card não monta — Geral fica como antes.
 */
const isWindows = computed(() => getDesktopBridge()?.platform === 'win32')

const canImport = computed(() => {
  const bridge = getDesktopBridge()
  return Boolean(isWindows.value && bridge?.legacyMedia)
})

type Phase = 'idle' | 'analyzing' | 'importing' | 'reconciling' | 'done' | 'error'

const phase = ref<Phase>('idle')
const analysis = ref<LegacyMediaAnalyzeResult | null>(null)
const importResult = ref<LegacyMediaImportResult | null>(null)
const progress = ref<LegacyMediaImportProgress | null>(null)
const reconcileMarked = ref(0)
const errorKey = ref<string | null>(null)

let unsubProgress: (() => void) | null = null

const busy = computed(
  () =>
    phase.value === 'analyzing' ||
    phase.value === 'importing' ||
    phase.value === 'reconciling',
)

const progressPercent = computed(() => {
  const p = progress.value
  /* v8 ignore next 1 -- barra só renderiza com progress presente e total real (cb do main) */
  if (!p || p.total <= 0) return 0
  return Math.min(100, Math.round((p.current / p.total) * 100))
})

/* v8 ignore start -- mb interpolado só dentro do bloco analysis.found */
const missingMb = computed(() =>
  analysis.value ? Math.round(analysis.value.missingBytes / (1024 * 1024)) : 0,
)
/* v8 ignore stop */

function clearProgressSub() {
  unsubProgress?.()
  unsubProgress = null
}

onUnmounted(() => {
  clearProgressSub()
})

/** Atualiza o manifesto da Central de Mídia com o que já está no disco. */
async function reconcileLibraryListing() {
  phase.value = 'reconciling'
  progress.value = null
  try {
    const result = await libraryStore.reconcileFromLocalMedia(
      (current, total, albumName) => {
        progress.value = {
          current,
          total,
          relativePath: albumName,
          mediaType: 'music',
        }
      },
    )
    reconcileMarked.value = result.marked
  } catch (err) {
    console.warn('[legacy-media] reconciliação da biblioteca falhou', err)
    reconcileMarked.value = 0
  }
}

async function runImport(selectedPath?: string) {
  const bridge = getDesktopBridge()
  if (!bridge?.legacyMedia || !isWindows.value || busy.value) return

  const sourcePath = selectedPath?.trim() || undefined
  const invalidKey = sourcePath
    ? 'settings.general.legacyMediaInvalidFolder'
    : 'settings.general.legacyMediaNotFound'

  phase.value = 'analyzing'
  errorKey.value = null
  analysis.value = null
  importResult.value = null
  progress.value = null
  reconcileMarked.value = 0

  try {
    const report = await bridge.legacyMedia.analyze(sourcePath)
    analysis.value = report

    if (!report.found) {
      phase.value = 'error'
      errorKey.value = invalidKey
      return
    }

    if (report.missing <= 0) {
      importResult.value = {
        ok: true,
        imported: 0,
        skipped: report.present,
        failed: 0,
        total: 0,
        reason: 'nothing-to-import',
      }
      await reconcileLibraryListing()
      phase.value = 'done'
      return
    }

    phase.value = 'importing'
    clearProgressSub()
    unsubProgress = bridge.legacyMedia.onImportProgress((payload) => {
      progress.value = payload
    })

    const result = await bridge.legacyMedia.import(sourcePath)
    importResult.value = result
    clearProgressSub()

    if (!result.ok) {
      phase.value = 'error'
      errorKey.value =
        result.reason === 'not-found' ? invalidKey : 'settings.general.legacyMediaError'
      return
    }

    await reconcileLibraryListing()
    phase.value = 'done'
  } catch (err) {
    console.error('[legacy-media] import falhou', err)
    phase.value = 'error'
    errorKey.value = 'settings.general.legacyMediaError'
  } finally {
    clearProgressSub()
  }
}

async function runManualImport() {
  const bridge = getDesktopBridge()
  if (!bridge?.legacyMedia?.pickFolder || !isWindows.value || busy.value) return

  const selected = await bridge.legacyMedia.pickFolder()
  if (!selected) return
  await runImport(selected)
}
</script>

<template>
  <!-- Linux/macOS: não renderiza nada (Geral permanece intacta). -->
  <GlassCard
    v-if="isWindows"
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
      {{ t('settings.general.legacyMediaHint') }}
    </p>

    <div class="legacy-media__actions">
      <button
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
        type="button"
        class="general-settings__btn general-settings__btn--secondary"
        data-test="legacy-media-pick-folder-button"
        :disabled="busy || !canImport"
        @click="runManualImport"
      >
        <i
          class="ti ti-folder-open"
          aria-hidden="true"
        />
        {{ t('settings.general.legacyMediaPickFolder') }}
      </button>
    </div>

    <p class="general-settings__hint general-settings__hint--sub">
      {{ t('settings.general.legacyMediaPickHint') }}
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
            : t('settings.general.legacyMediaProgress', {
                current: progress.current,
                total: progress.total,
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
          t('settings.general.legacyMediaScanSummary', {
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
