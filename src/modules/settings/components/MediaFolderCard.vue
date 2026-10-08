<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { MediaFolderStatus } from '@shared/types/desktop-bridge'

const { t } = useI18n()

/** Mesma regra do card de importação legada: só Windows no desktop. */
const isWindows = computed(() => getDesktopBridge()?.platform === 'win32')

const canManage = computed(() => {
  const bridge = getDesktopBridge()
  return Boolean(isWindows.value && bridge?.mediaFolder)
})

type Phase = 'idle' | 'moving' | 'done' | 'error'

const phase = ref<Phase>('idle')
const status = ref<MediaFolderStatus | null>(null)
const errorKey = ref<string | null>(null)
const lastMovedPath = ref<string | null>(null)

const busy = computed(() => phase.value === 'moving')

async function refreshStatus() {
  const bridge = getDesktopBridge()
  if (!bridge?.mediaFolder) return
  status.value = await bridge.mediaFolder.status()
}

onMounted(() => {
  void refreshStatus()
})

async function chooseAndMove() {
  const bridge = getDesktopBridge()
  /* v8 ignore next 1 -- remap V8 do short-circuit: busy true exercido pelo duplo clique */
  if (!bridge?.mediaFolder || !canManage.value || busy.value) return

  errorKey.value = null
  lastMovedPath.value = null
  const selected = await bridge.mediaFolder.pick()
  if (!selected) return

  phase.value = 'moving'
  try {
    const result = await bridge.mediaFolder.migrate(selected)
    if (!result.ok) {
      phase.value = 'error'
      if (result.reason === 'dest-inside-source') {
        errorKey.value = 'settings.general.mediaFolderDestInside'
      } else if (result.reason === 'persist-failed') {
        errorKey.value = 'settings.general.mediaFolderPersistError'
      } else {
        errorKey.value = 'settings.general.mediaFolderError'
      }
      return
    }
    lastMovedPath.value = result.path
    phase.value = 'done'
    await refreshStatus()
  } catch (error) {
    console.error('[settings] migração de pasta de mídia', error)
    phase.value = 'error'
    errorKey.value = 'settings.general.mediaFolderError'
  }
}

async function restoreDefault() {
  const bridge = getDesktopBridge()
  /* v8 ignore next 3 -- botão só renderiza com status/canManage; guard é defesa */
  if (!bridge?.mediaFolder || !canManage.value || busy.value || !status.value) {
    return
  }

  errorKey.value = null
  lastMovedPath.value = null
  phase.value = 'moving'
  try {
    const result = await bridge.mediaFolder.migrate(status.value.defaultPath)
    if (!result.ok) {
      phase.value = 'error'
      errorKey.value = 'settings.general.mediaFolderError'
      return
    }
    lastMovedPath.value = result.path
    phase.value = 'done'
    await refreshStatus()
  } catch (error) {
    console.error('[settings] restaurar pasta padrão de mídia', error)
    phase.value = 'error'
    errorKey.value = 'settings.general.mediaFolderError'
  }
}
</script>

<template>
  <GlassCard
    v-if="isWindows"
    class="general-settings__card"
    elevated
    data-test="media-folder-card"
  >
    <div
      class="general-settings__accent"
      aria-hidden="true"
    />

    <div class="general-settings__header">
      <div class="general-settings__heading">
        <i
          class="ti ti-folder-share general-settings__icon"
          aria-hidden="true"
        />
        <h3 class="general-settings__title">
          {{ t('settings.general.mediaFolderTitle') }}
        </h3>
      </div>
    </div>

    <p class="general-settings__hint">
      {{ t('settings.general.mediaFolderHint') }}
    </p>

    <p
      v-if="status"
      class="media-folder__path"
      data-test="media-folder-current-path"
    >
      <span class="media-folder__path-label">
        {{ t('settings.general.mediaFolderCurrent') }}
      </span>
      <code class="media-folder__path-value">{{ status.currentPath }}</code>
      <span
        v-if="status.isCustom"
        class="media-folder__badge"
      >
        {{ t('settings.general.mediaFolderCustomBadge') }}
      </span>
    </p>

    <div class="media-folder__actions">
      <button
        type="button"
        class="general-settings__btn general-settings__btn--primary"
        data-test="media-folder-move-button"
        :disabled="busy || !canManage"
        @click="chooseAndMove"
      >
        <i
          class="ti"
          :class="busy ? 'ti-loader-2 general-settings__spin' : 'ti-folder-up'"
          aria-hidden="true"
        />
        {{
          busy
            ? t('settings.general.mediaFolderMoving')
            : t('settings.general.mediaFolderMove')
        }}
      </button>

      <button
        v-if="status?.isCustom"
        type="button"
        class="general-settings__btn general-settings__btn--secondary"
        data-test="media-folder-restore-button"
        :disabled="busy || !canManage"
        @click="restoreDefault"
      >
        <i
          class="ti ti-restore"
          aria-hidden="true"
        />
        {{ t('settings.general.mediaFolderRestore') }}
      </button>
    </div>

    <p class="general-settings__hint general-settings__hint--sub">
      {{ t('settings.general.mediaFolderMoveHint') }}
    </p>

    <p
      v-if="phase === 'done' && lastMovedPath"
      class="general-settings__status general-settings__status--success"
      data-test="media-folder-success"
    >
      <i
        class="ti ti-circle-check"
        aria-hidden="true"
      />
      {{ t('settings.general.mediaFolderMoved', { path: lastMovedPath }) }}
    </p>

    <p
      v-if="phase === 'error' && errorKey"
      class="general-settings__status general-settings__status--error"
      data-test="media-folder-error"
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
/* Mesmos tokens de LegacyMediaImportCard / GeneralView (scoped não herda). */
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

.media-folder__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
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

.media-folder__path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  line-height: 1.35;
}

.media-folder__path-label {
  color: var(--ds-color-on-surface-variant);
  font-weight: 600;
}

.media-folder__path-value {
  max-width: 100%;
  padding: 0.15rem 0.4rem;
  overflow: hidden;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--ds-color-surface-variant, #2a2a2e) 80%, transparent);
  color: var(--ds-color-on-surface, #f5f5f5);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-folder__badge {
  display: inline-flex;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary, #fb923c) 22%, transparent);
  color: var(--ds-color-primary, #fb923c);
  font-size: 0.72rem;
  font-weight: 700;
}

.general-settings__spin {
  animation: media-folder-spin 0.9s linear infinite;
}

@keyframes media-folder-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
