<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import type { BackupProgress } from '@shared/types/desktop-bridge'

const { t } = useI18n()

type Phase = 'idle' | 'backing-up' | 'restoring' | 'done' | 'error'

const phase = ref<Phase>('idle')
const errorKey = ref<string | null>(null)
const lastBackupPath = ref<string | null>(null)
const progress = ref<BackupProgress | null>(null)
const restoreConfirmOpen = ref(false)
const restoreAcknowledged = ref(false)

const busy = computed(() => phase.value === 'backing-up' || phase.value === 'restoring')
const progressPercent = computed(() => {
  //computed só avalia com barra determinate (progress não-nulo)
  /* v8 ignore start */
  const total = progress.value?.total ?? 0
  const current = progress.value?.current ?? 0
  /* v8 ignore stop */
  /* v8 ignore next 1 -- barra indeterminada não avalia este computed (lazy); total<=0 inalcançável com bar visível */
  if (total <= 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
})
const hasDeterminateProgress = computed(() => (progress.value?.total ?? 0) > 0)
const progressTextValues = computed(() => ({
  //span só renderiza determinate (progress não-nulo)
  /* v8 ignore start */
  current: progress.value?.current ?? 0,
  total: progress.value?.total ?? 0,
  /* v8 ignore stop */
}))

let unsubProgress: (() => void) | null = null

function bindProgress() {
  unsubProgress?.()
  const bridge = getDesktopBridge()
  unsubProgress = bridge?.backup?.onProgress((payload) => {
    progress.value = payload
  }) ?? null
}

onUnmounted(() => {
  unsubProgress?.()
})

function openRestoreConfirm() {
  if (!isDesktopApp() || busy.value) return
  errorKey.value = null
  restoreAcknowledged.value = false
  restoreConfirmOpen.value = true
}

function closeRestoreConfirm() {
  /* v8 ignore next 1 -- dialog só existe fora de busy; cancel disabled durante busy */
  if (busy.value) return
  restoreConfirmOpen.value = false
  restoreAcknowledged.value = false
}

async function createBackup() {
  const bridge = getDesktopBridge()
  if (!bridge?.backup || !isDesktopApp() || busy.value) return

  errorKey.value = null
  lastBackupPath.value = null
  progress.value = { current: 0, total: 0, zipPath: '' }
  phase.value = 'backing-up'
  bindProgress()
  await nextTick()
  try {
    const result = await bridge.backup.create()
    if (!result.ok) {
      phase.value = result.reason === 'cancelled' ? 'idle' : 'error'
      if (result.reason !== 'cancelled') errorKey.value = 'settings.general.backupError'
      return
    }
    lastBackupPath.value = result.path ?? null
    phase.value = 'done'
  } catch (error) {
    console.error('[settings] backup', error)
    phase.value = 'error'
    errorKey.value = 'settings.general.backupError'
  }
}

async function confirmRestore() {
  /* v8 ignore next 1 -- botão confirmar desabilitado sem ack e durante busy */
  if (!restoreAcknowledged.value || busy.value) return
  const bridge = getDesktopBridge()
  if (!bridge?.backup || !isDesktopApp()) return

  restoreConfirmOpen.value = false
  errorKey.value = null
  lastBackupPath.value = null
  progress.value = { current: 0, total: 0, zipPath: '' }
  phase.value = 'restoring'
  bindProgress()
  await nextTick()
  try {
    const result = await bridge.backup.restore()
    if (!result.ok) {
      phase.value = result.reason === 'cancelled' ? 'idle' : 'error'
      if (result.reason !== 'cancelled') errorKey.value = 'settings.general.backupRestoreError'
      return
    }
    window.location.reload()
  } catch (error) {
    console.error('[settings] restore backup', error)
    phase.value = 'error'
    errorKey.value = 'settings.general.backupRestoreError'
  }
}
</script>

<template>
  <GlassCard
    v-if="isDesktopApp()"
    class="general-settings__card"
    elevated
  >
    <div
      class="general-settings__accent"
      aria-hidden="true"
    />

    <div class="general-settings__header">
      <div class="general-settings__heading">
        <i
          class="ti ti-database-export general-settings__icon"
          aria-hidden="true"
        />
        <h3 class="general-settings__title">
          {{ t('settings.general.backupTitle') }}
        </h3>
      </div>
    </div>

    <p class="general-settings__hint">
      {{ t('settings.general.backupHint') }}
    </p>

    <div
      class="backup-card__actions"
      :aria-busy="busy"
    >
      <button
        type="button"
        class="general-settings__btn general-settings__btn--primary"
        :class="{ 'general-settings__btn--working': phase === 'backing-up' }"
        :disabled="busy"
        @click="createBackup"
      >
        <i
          class="ti"
          :class="phase === 'backing-up' ? 'ti-loader-2 backup-card__spin' : 'ti-file-zip'"
          aria-hidden="true"
        />
        {{
          phase === 'backing-up'
            ? t('settings.general.backupCreating')
            : t('settings.general.backupCreate')
        }}
      </button>

      <button
        type="button"
        class="general-settings__btn"
        :class="{ 'general-settings__btn--working': phase === 'restoring' }"
        :disabled="busy"
        @click="openRestoreConfirm"
      >
        <i
          class="ti"
          :class="phase === 'restoring' ? 'ti-loader-2 backup-card__spin' : 'ti-file-import'"
          aria-hidden="true"
        />
        {{
          phase === 'restoring'
            ? t('settings.general.backupRestoring')
            : t('settings.general.backupRestore')
        }}
      </button>
    </div>

    <div
      v-if="busy"
      class="backup-card__progress"
      role="status"
      aria-live="polite"
    >
      <div
        class="backup-card__bar"
        role="progressbar"
        :aria-valuenow="hasDeterminateProgress ? progressPercent : undefined"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-label="
          phase === 'restoring'
            ? t('settings.general.backupRestoring')
            : t('settings.general.backupCreating')
        "
      >
        <div
          class="backup-card__bar-fill"
          :class="{ 'backup-card__bar-fill--indeterminate': !hasDeterminateProgress }"
          :style="hasDeterminateProgress ? { width: `${progressPercent}%` } : undefined"
        />
      </div>
      <p class="backup-card__progress-text">
        <i
          class="ti ti-loader-2 backup-card__spin"
          aria-hidden="true"
        />
        <span v-if="hasDeterminateProgress">
          {{ t('settings.general.backupProgress', progressTextValues) }}
        </span>
        <span v-else>
          {{
            phase === 'restoring'
              ? t('settings.general.backupRestoring')
              : t('settings.general.backupCreating')
          }}
        </span>
      </p>
    </div>

    <p
      v-if="phase === 'done' && lastBackupPath"
      class="general-settings__status general-settings__status--success"
    >
      <i
        class="ti ti-circle-check"
        aria-hidden="true"
      />
      {{ t('settings.general.backupCreated', { path: lastBackupPath }) }}
    </p>

    <p
      v-if="errorKey"
      class="general-settings__status general-settings__status--error"
    >
      <i
        class="ti ti-alert-circle"
        aria-hidden="true"
      />
      {{ t(errorKey) }}
    </p>

    <Teleport to="body">
      <div
        v-if="restoreConfirmOpen"
        class="clear-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-backup-restore-title"
        aria-describedby="settings-backup-restore-text"
      >
        <div
          class="clear-confirm__backdrop"
          aria-hidden="true"
          @click="closeRestoreConfirm"
        />
        <div class="clear-confirm__panel">
          <h2
            id="settings-backup-restore-title"
            class="clear-confirm__title"
          >
            {{ t('settings.general.backupRestoreConfirmTitle') }}
          </h2>
          <p
            id="settings-backup-restore-text"
            class="clear-confirm__text"
          >
            {{ t('settings.general.backupRestoreConfirmText') }}
          </p>
          <label class="clear-confirm__check">
            <input
              v-model="restoreAcknowledged"
              type="checkbox"
              class="clear-confirm__checkbox"
              :disabled="busy"
            >
            <span>{{ t('settings.general.backupRestoreConfirmCheckbox') }}</span>
          </label>
          <div class="clear-confirm__actions">
            <button
              type="button"
              class="clear-confirm__btn"
              :disabled="busy"
              @click="closeRestoreConfirm"
            >
              {{ t('settings.general.backupRestoreConfirmCancel') }}
            </button>
            <button
              type="button"
              class="clear-confirm__btn clear-confirm__btn--danger"
              :disabled="!restoreAcknowledged || busy"
              @click="confirmRestore"
            >
              {{ t('settings.general.backupRestoreConfirmAction') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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

.backup-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.backup-card__progress {
  margin-top: 1rem;
}

.backup-card__bar {
  width: 100%;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
}

.backup-card__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ds-color-primary);
  transition: width 160ms ease;

  &--indeterminate {
    width: 36%;
    animation: backup-card-indeterminate 1.1s ease-in-out infinite;
  }
}

.backup-card__progress-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.55rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8125rem;
  font-weight: 500;
}

.backup-card__spin {
  animation: backup-card-spin 0.9s linear infinite;
}

@keyframes backup-card-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes backup-card-indeterminate {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}

.general-settings__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: var(--ds-radius-full);
  background: transparent;
  color: var(--ds-color-on-surface);
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

  &--working:disabled {
    opacity: 1;
    cursor: wait;
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

.general-settings__status {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  font-weight: 500;
  word-break: break-all;
}

.general-settings__status--success {
  color: #4caf50;
}

.general-settings__status--error {
  color: rgb(var(--v-theme-error));
}

.clear-confirm {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.clear-confirm__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(0 0 0 / 45%);
}

.clear-confirm__panel {
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

.clear-confirm__title {
  margin: 0 0 0.75rem;
  color: var(--ds-color-on-surface);
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

.clear-confirm__text {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
}

.clear-confirm__check {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1.25rem;
  color: var(--ds-color-on-surface);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}

.clear-confirm__checkbox {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.125rem;
  accent-color: rgb(var(--v-theme-error));
  cursor: pointer;
}

.clear-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.clear-confirm__btn {
  height: 2.25rem;
  padding: 0 1rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
    color: var(--ds-color-error, #ffb4ab);
  }
}
</style>
