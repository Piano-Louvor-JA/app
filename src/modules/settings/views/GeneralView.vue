<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { isDesktopApp } from '@shared/services/desktop-bridge'
import { clearWorkspace } from '@shared/services/workspace-api'
import {
  removeBrowserItem,
  removeBrowserItemsByPrefix,
} from '@shared/services/browser-storage'
import { BROWSER_STORAGE_KEYS, USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { APP_VERSION } from '@shared/constants/app'
import { useUpdateChecker } from '@shared/composables/useUpdateChecker'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'
import {
  exportLouvorjaFile,
  importLouvorjaFile,
} from '@modules/sync/services/louvorja-file'
import {
  exportLouvorjaFromBrowser,
  importLouvorjaIntoBrowser,
} from '@modules/sync/services/louvorja-adapter'
import {
  decodeLouvorjaPackage,
  encodeLouvorjaPackage,
  isValidLouvorjaContent,
} from '@modules/sync/services/louvorja-package'
import LegacyMediaImportCard from '../components/LegacyMediaImportCard.vue'
import MediaFolderCard from '../components/MediaFolderCard.vue'
import AppBackupCard from '../components/AppBackupCard.vue'

const { t, locale } = useI18n()
const isClearing = ref(false)
const clearError = ref(false)
const clearConfirmOpen = ref(false)
const clearAcknowledged = ref(false)
const clearConfirmTitleId = 'settings-clear-confirm-title'
const clearConfirmTextId = 'settings-clear-confirm-text'

function openClearConfirm() {
  if (!isDesktopApp() || isClearing.value) return
  clearError.value = false
  clearAcknowledged.value = false
  clearConfirmOpen.value = true
}

function closeClearConfirm() {
  /* v8 ignore next 1 -- popup fecha antes de isClearing ficar true */
  if (isClearing.value) return
  clearConfirmOpen.value = false
  clearAcknowledged.value = false
}

type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'success'; messageKey: string; params?: Record<string, unknown> }
  | { kind: 'error'; messageKey: string }

const syncStatus = ref<SyncStatus>({ kind: 'idle' })
const isSyncBusy = ref(false)

async function handleSyncExport() {
  if (isSyncBusy.value) return
  isSyncBusy.value = true
  syncStatus.value = { kind: 'idle' }
  try {
    const pkg = exportLouvorjaFromBrowser(APP_VERSION, isDesktopApp() ? 'desktop' : 'web')
    const ok = await exportLouvorjaFile(encodeLouvorjaPackage(pkg))
    syncStatus.value = ok
      ? { kind: 'success', messageKey: 'settings.general.syncExported' }
      : { kind: 'error', messageKey: 'settings.general.syncCancelled' }
  } catch (error) {
    console.error('[settings] falha ao exportar pacote', error)
    syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
  } finally {
    isSyncBusy.value = false
  }
}

async function handleSyncImport() {
  if (isSyncBusy.value) return
  isSyncBusy.value = true
  syncStatus.value = { kind: 'idle' }
  try {
    const raw = await importLouvorjaFile()
    if (raw == null) {
      syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncCancelled' }
      return
    }
    if (!isValidLouvorjaContent(raw)) {
      syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
      return
    }
    const result = importLouvorjaIntoBrowser(decodeLouvorjaPackage(raw))
    if (result.applied.length > 0) {
      if (result.applied.includes("liturgy")) {
        window.dispatchEvent(new CustomEvent("liturgy:imported"))
      }
      syncStatus.value = {
        kind: 'success',
        messageKey: 'settings.general.syncImported',
        params: { applied: result.applied.join(', ') },
      }
    } else {
      syncStatus.value = {
        kind: 'success',
        messageKey: 'settings.general.syncNothingToApply',
        params: {
          localModified: result.localModified ?? '—',
          packageModified: result.packageModified ?? '—',
        },
      }
    }
  } catch (error) {
    console.error('[settings] falha ao importar pacote', error)
    syncStatus.value = { kind: 'error', messageKey: 'settings.general.syncInvalid' }
  } finally {
    isSyncBusy.value = false
  }
}

const {
  checkForUpdates,
  isChecking,
  hasUpdate,
  newVersion,
  error: updateError,
  hasChecked,
} = useUpdateChecker()

const SUPPORTED_LOCALES = [
  { value: 'pt-BR', labelKey: 'settings.general.languagePortuguese' },
  { value: 'es', labelKey: 'settings.general.languageSpanish' },
] as const

const currentLanguage = ref(
  getUserPreference<string>(USER_PREFERENCE_KEYS.language, 'pt-BR') ?? 'pt-BR',
)

function changeLanguage(lang: string) {
  currentLanguage.value = lang
  locale.value = lang
  setUserPreference(USER_PREFERENCE_KEYS.language, lang)
}

async function handleCheckUpdate() {
  await checkForUpdates()
}

async function clearAllLocalData() {
  /* v8 ignore next 1 -- botão confirmar só habilita com acknowledged e desktop */
  if (!isDesktopApp() || isClearing.value || !clearAcknowledged.value) return

  isClearing.value = true
  clearError.value = false
  clearConfirmOpen.value = false

  try {
    const cleared = await clearWorkspace()
    if (!cleared) {
      throw new Error('clear failed')
    }

    removeBrowserItem(BROWSER_STORAGE_KEYS.userPreferences)
    removeBrowserItem(BROWSER_STORAGE_KEYS.recentCollections)
    removeBrowserItem(BROWSER_STORAGE_KEYS.topSongs)
    removeBrowserItemsByPrefix(BROWSER_STORAGE_KEYS.catalogSessionPrefix, 'session')

    window.location.reload()
  } catch (error) {
    console.error('[settings] falha ao limpar dados', error)
    clearError.value = true
    isClearing.value = false
  }
}
</script>

<template>
  <div class="general-settings">
    <!-- Atualizações -->
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__accent" aria-hidden="true" />

      <div class="general-settings__header">
        <div class="general-settings__heading">
          <i class="ti ti-refresh-dot general-settings__icon" aria-hidden="true" />
          <h3 class="general-settings__title">
            {{ t('settings.general.updateTitle') }}
          </h3>
        </div>
      </div>

      <p class="general-settings__hint">
        {{ t('settings.general.updateHint') }}
      </p>

      <button
        type="button"
        class="general-settings__btn general-settings__btn--primary"
        :disabled="!isDesktopApp() || isChecking"
        @click="handleCheckUpdate"
      >
        <i class="ti ti-cloud-download" aria-hidden="true" />
        {{ isChecking ? t('settings.general.checking') : t('settings.general.checkUpdate') }}
      </button>

      <p
        v-if="hasUpdate"
        class="general-settings__status general-settings__status--success"
      >
        <i class="ti ti-circle-check" aria-hidden="true" />
        {{ t('settings.general.updateAvailable', { version: newVersion }) }}
      </p>
      <p
        v-else-if="updateError"
        class="general-settings__status general-settings__status--error"
      >
        <i class="ti ti-alert-circle" aria-hidden="true" />
        {{ t('settings.general.updateError') }}
      </p>
      <p
        v-else-if="hasChecked && !isChecking"
        class="general-settings__status general-settings__status--info"
      >
        <i class="ti ti-check" aria-hidden="true" />
        {{ t('settings.general.updateNotAvailable') }}
      </p>

      <p
        v-if="!isDesktopApp()"
        class="general-settings__desktop-only"
      >
        {{ t('settings.general.updateDesktopOnly') }}
      </p>
    </GlassCard>

    <!-- Idioma -->
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__accent" aria-hidden="true" />

      <div class="general-settings__header">
        <div class="general-settings__heading">
          <i class="ti ti-world general-settings__icon" aria-hidden="true" />
          <h3 class="general-settings__title">
            {{ t('settings.general.languageTitle') }}
          </h3>
        </div>
      </div>

      <p class="general-settings__hint">
        {{ t('settings.general.languageHint') }}
      </p>

      <div class="general-settings__lang-options">
        <button
          v-for="lang in SUPPORTED_LOCALES"
          :key="lang.value"
          type="button"
          class="general-settings__lang-btn"
          :class="{ 'general-settings__lang-btn--active': currentLanguage === lang.value }"
          @click="changeLanguage(lang.value)"
        >
          {{ t(lang.labelKey) }}
        </button>
      </div>
    </GlassCard>

    <!-- Sincronização (.louvorja) -->
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__accent" aria-hidden="true" />

      <div class="general-settings__header">
        <div class="general-settings__heading">
          <i class="ti ti-arrows-exchange general-settings__icon" aria-hidden="true" />
          <h3 class="general-settings__title">
            {{ t('settings.general.syncTitle') }}
          </h3>
        </div>
      </div>

      <p class="general-settings__hint">
        {{ t('settings.general.syncHint') }}
      </p>

      <div class="general-settings__sync-actions">
        <button
          type="button"
          class="general-settings__btn general-settings__btn--primary"
          :disabled="isSyncBusy"
          @click="handleSyncExport"
        >
          <i class="ti ti-file-export" aria-hidden="true" />
          {{ t('settings.general.syncExport') }}
        </button>

        <button
          type="button"
          class="general-settings__btn"
          :disabled="isSyncBusy"
          @click="handleSyncImport"
        >
          <i class="ti ti-file-import" aria-hidden="true" />
          {{ t('settings.general.syncImport') }}
        </button>
      </div>

      <p
        v-if="syncStatus.kind === 'success'"
        class="general-settings__status general-settings__status--success"
      >
        <i class="ti ti-circle-check" aria-hidden="true" />
        {{ t(syncStatus.messageKey, syncStatus.params ?? {}) }}
      </p>
      <p
        v-else-if="syncStatus.kind === 'error'"
        class="general-settings__status general-settings__status--error"
      >
        <i class="ti ti-alert-circle" aria-hidden="true" />
        {{ t(syncStatus.messageKey) }}
      </p>
    </GlassCard>

    <!-- Importação de mídia do Louvor JA legado (somente Windows) -->
    <LegacyMediaImportCard />

    <!-- YouTube: agora na aba Mídia & Player (junto dos demais players) -->

    <!-- Pasta de mídia compartilhada (somente Windows, junto da importação) -->
    <MediaFolderCard />

    <!-- Backup completo da pasta de dados + mídias -->
    <AppBackupCard />

    <!-- Dados locais -->
    <GlassCard class="general-settings__card" elevated>
      <div class="general-settings__accent general-settings__accent--danger" aria-hidden="true" />

      <div class="general-settings__header">
        <div class="general-settings__heading">
          <i class="ti ti-database general-settings__icon" aria-hidden="true" />
          <h3 class="general-settings__title">
            {{ t('settings.general.dataTitle') }}
          </h3>
        </div>
      </div>

      <p class="general-settings__hint">
        {{ t('settings.general.dataHint') }}
      </p>

      <button
        type="button"
        class="general-settings__btn general-settings__btn--danger"
        :disabled="!isDesktopApp() || isClearing"
        @click="openClearConfirm"
      >
        <i class="ti ti-trash" aria-hidden="true" />
        {{ t('settings.general.clearData') }}
      </button>

      <p
        v-if="clearError"
        class="general-settings__status general-settings__status--error"
      >
        <i class="ti ti-alert-circle" aria-hidden="true" />
        {{ t('settings.general.clearError') }}
      </p>

      <p
        v-if="!isDesktopApp()"
        class="general-settings__desktop-only"
      >
        {{ t('settings.general.desktopOnly') }}
      </p>
    </GlassCard>

    <Teleport to="body">
      <div
        v-if="clearConfirmOpen"
        class="clear-confirm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="clearConfirmTitleId"
        :aria-describedby="clearConfirmTextId"
      >
        <div
          class="clear-confirm__backdrop"
          aria-hidden="true"
          @click="closeClearConfirm"
        />
        <div class="clear-confirm__panel">
          <h2
            :id="clearConfirmTitleId"
            class="clear-confirm__title"
          >
            {{ t('settings.general.clearConfirmTitle') }}
          </h2>
          <p
            :id="clearConfirmTextId"
            class="clear-confirm__text"
          >
            {{ t('settings.general.clearConfirmText') }}
          </p>
          <label class="clear-confirm__check">
            <input
              v-model="clearAcknowledged"
              type="checkbox"
              class="clear-confirm__checkbox"
              :disabled="isClearing"
            >
            <span>{{ t('settings.general.clearConfirmCheckbox') }}</span>
          </label>
          <div class="clear-confirm__actions">
            <button
              type="button"
              class="clear-confirm__btn"
              :disabled="isClearing"
              @click="closeClearConfirm"
            >
              {{ t('settings.general.clearConfirmCancel') }}
            </button>
            <button
              type="button"
              class="clear-confirm__btn clear-confirm__btn--danger"
              :disabled="!clearAcknowledged || isClearing"
              @click="clearAllLocalData"
            >
              {{ t('settings.general.clearConfirmAction') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.general-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding-bottom: 1.5rem;
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

.general-settings__accent--danger {
  background: rgb(var(--v-theme-error));
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

.general-settings__accent--danger ~ .general-settings__header .general-settings__icon {
  color: rgb(var(--v-theme-error));
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

/* Botões */
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

.general-settings__btn--danger {
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-error)) 28%, transparent);
  background: color-mix(in srgb, rgb(var(--v-theme-error)) 12%, transparent);
  color: rgb(var(--v-theme-error));

  &:hover:not(:disabled) {
    background: color-mix(in srgb, rgb(var(--v-theme-error)) 22%, transparent);
  }
}

/* Seletor de idioma */
.general-settings__lang-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.general-settings__sync-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.general-settings__lang-btn {
  padding: 0.5rem 1.25rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: var(--ds-radius-full);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  }
}

.general-settings__lang-btn--active {
  border-color: var(--ds-color-primary);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);
}

/* Status */
.general-settings__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  font-weight: 500;

  .ti {
    font-size: 18px;
    line-height: 1;
  }
}

.general-settings__status--success {
  color: #4caf50;
}

.general-settings__status--error {
  color: rgb(var(--v-theme-error));
}

.general-settings__status--info {
  color: var(--ds-color-on-surface-variant);
  opacity: 0.8;
}

.general-settings__desktop-only {
  margin: 0.5rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  opacity: 0.6;
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
  transition:
    background-color 200ms ease,
    opacity 150ms ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
    color: var(--ds-color-error, #ffb4ab);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 28%, transparent);
    }
  }
}
</style>
