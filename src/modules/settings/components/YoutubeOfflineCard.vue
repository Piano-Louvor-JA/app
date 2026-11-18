<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appConfirm } from '@shared/composables/useAppConfirm'
import type {
  OnlineVideoFolder,
  OnlineVideoFolderInfo,
  OnlineVideoQuality,
  OnlineVideoSettings,
  OnlineVideoStatus,
} from '@/shared/types/desktop-bridge'

const QUALITIES: OnlineVideoQuality[] = [480, 720, 1080]
const GB = 1024 ** 3
const MB = 1024 ** 2

const { t } = useI18n()

const api = window.louvorja?.isElectron ? window.louvorja.onlineVideo : undefined

const status = ref<OnlineVideoStatus | null>(null)
const busy = ref(false)
const unsubscribe: Array<() => void> = []

const visible = computed(() => Boolean(status.value && !status.value.hidden))

/** As duas pastas (sistema e personalizada); sem `folders` (versão antiga do main), só a do sistema. */
const folders = computed(() => {
  const st = status.value!
  const info = st.folders
  const system: OnlineVideoFolderInfo = info?.system ?? {
    dir: st.cacheDir ?? '',
    bytes: st.usage.bytes,
    count: st.usage.count,
    limitBytes: st.usage.limitBytes,
  }
  return {
    active: (info?.active ?? 'system') as OnlineVideoFolder,
    list: [
      { key: 'system' as const, info: system },
      { key: 'custom' as const, info: info?.custom ?? null },
    ],
  }
})

function sizeText(info: OnlineVideoFolderInfo) {
  const size = info.bytes >= GB ? `${(info.bytes / GB).toFixed(1)} GB` : `${Math.round(info.bytes / MB)} MB`
  return t('settings.youtubeOffline.folderSize', { size, count: info.count })
}

function selectFolder(key: OnlineVideoFolder) {
  if (key === 'custom' && !folders.value.list[1].info) return chooseFolder()
  if (folders.value.active !== key) void update({ folder: key })
}

function chooseFolder() {
  if (api?.chooseFolder) void run(() => api!.chooseFolder!())
}

async function refresh() {
  try {
    status.value = await api!.status()
  } catch (error) {
    console.error('[online-video] status falhou', error)
  }
}

onMounted(async () => {
  if (!api) return
  await refresh()
  unsubscribe.push(api.onTools((tools) => {
    if (status.value) status.value = { ...status.value, tools }
  }))
  unsubscribe.push(api.onChanged(({ status: item }) => {
    if (item.state === 'ready') void refresh()
  }))
})

onBeforeUnmount(() => {
  for (const stop of unsubscribe.splice(0)) stop()
})

async function run(action: () => Promise<OnlineVideoStatus>) {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await action()
  } catch (error) {
    console.error('[online-video] ação falhou', error)
  } finally {
    busy.value = false
  }
}

function update(partial: Partial<OnlineVideoSettings>) {
  return run(() => api!.setSettings(partial))
}

async function openFolder(which: OnlineVideoFolder) {
  try {
    await api?.openFolder?.(which)
  } catch {
    // sem gerenciador de arquivos: o caminho continua visível para copiar
  }
}

async function clearCache(which: OnlineVideoFolder) {
  const confirmed = await appConfirm({
    title: t('settings.youtubeOffline.clearTitle'),
    message: t(which === 'custom' ? 'settings.youtubeOffline.clearMessageCustom' : 'settings.youtubeOffline.clearMessageSystem'),
    confirmLabel: t('settings.youtubeOffline.clearConfirm'),
    cancelLabel: t('settings.youtubeOffline.cancel'),
    danger: true,
  })
  if (confirmed) await run(() => api!.clear(which))
}
</script>

<template>
  <section v-if="visible && status" class="yt-offline-card" data-test="youtube-offline-card">
    <h3>{{ t('settings.youtubeOffline.title') }}</h3>

    <p v-if="!status.available" class="hint" data-test="youtube-offline-unavailable">
      {{ t('settings.youtubeOffline.unavailable') }}
    </p>

    <template v-else>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="status.settings.enabled"
          :disabled="busy"
          data-test="youtube-offline-enabled"
          @change="update({ enabled: ($event.target as HTMLInputElement).checked })"
        >
        <span>{{ t('settings.youtubeOffline.enabled') }}</span>
      </label>
      <p class="hint">
        {{ status.settings.enabled ? t('settings.youtubeOffline.enabledHint') : t('settings.youtubeOffline.disabledHint') }}
      </p>

      <div class="row">
        <span class="label">{{ t('settings.youtubeOffline.quality') }}</span>
        <div class="options" role="radiogroup" :aria-label="t('settings.youtubeOffline.quality')">
          <button
            v-for="height in QUALITIES"
            :key="height"
            type="button"
            role="radio"
            :aria-checked="status.settings.maxHeight === height"
            :class="{ selected: status.settings.maxHeight === height }"
            :disabled="busy"
            :data-test="`youtube-offline-quality-${height}`"
            @click="update({ maxHeight: height })"
          >
            {{ height }}p
          </button>
        </div>
      </div>

      <p class="label folders-title">{{ t('settings.youtubeOffline.foldersTitle') }}</p>
      <p class="hint folders-hint">{{ t('settings.youtubeOffline.foldersHint') }}</p>
      <div class="folders" role="radiogroup" :aria-label="t('settings.youtubeOffline.foldersTitle')">
        <div
          v-for="folder in folders.list"
          :key="folder.key"
          class="folder-box"
          :class="{ active: folders.active === folder.key }"
          :data-test="`youtube-offline-folder-${folder.key}`"
        >
          <button
            type="button"
            role="radio"
            class="folder-pick"
            :aria-checked="folders.active === folder.key"
            :disabled="busy"
            :data-test="`youtube-offline-use-${folder.key}`"
            @click="selectFolder(folder.key)"
          >
            <span class="radio" aria-hidden="true" />
            <span class="folder-name">
              {{ t(folder.key === 'system' ? 'settings.youtubeOffline.folderSystem' : 'settings.youtubeOffline.folderCustom') }}
            </span>
            <span v-if="folders.active === folder.key" class="badge">{{ t('settings.youtubeOffline.folderActive') }}</span>
          </button>

          <template v-if="folder.info">
            <code class="path" :title="folder.info.dir">{{ folder.info.dir }}</code>
            <div class="folder-actions">
              <span class="hint size" :data-test="`youtube-offline-size-${folder.key}`">{{ sizeText(folder.info) }}</span>
              <button
                v-if="api?.openFolder"
                type="button"
                :data-test="`youtube-offline-open-${folder.key}`"
                @click="openFolder(folder.key)"
              >
                {{ t('settings.youtubeOffline.openFolder') }}
              </button>
              <button
                v-if="folder.key === 'custom' && api?.chooseFolder"
                type="button"
                :disabled="busy"
                data-test="youtube-offline-change-folder"
                @click="chooseFolder"
              >
                {{ t('settings.youtubeOffline.changeFolder') }}
              </button>
              <button
                type="button"
                class="danger"
                :disabled="busy || folder.info.count === 0"
                :data-test="`youtube-offline-clear-${folder.key}`"
                @click="clearCache(folder.key)"
              >
                {{ t('settings.youtubeOffline.clear') }}
              </button>
            </div>
          </template>
          <div v-else class="folder-actions">
            <span class="hint">{{ t('settings.youtubeOffline.folderCustomHint') }}</span>
            <button
              v-if="api?.chooseFolder"
              type="button"
              :disabled="busy"
              data-test="youtube-offline-choose-folder"
              @click="chooseFolder"
            >
              {{ t('settings.youtubeOffline.chooseFolder') }}
            </button>
          </div>
        </div>
      </div>

      <div class="row" data-test="youtube-offline-tools">
        <span v-if="status.tools.state === 'installing'" class="hint">
          {{ t('settings.youtubeOffline.toolsInstalling', { progress: Math.round((status.tools.progress ?? 0) * 100) }) }}
        </span>
        <span v-else-if="status.tools.state === 'ready'" class="hint">
          {{ t('settings.youtubeOffline.toolsReady', { version: status.tools.version ?? '' }) }}
        </span>
        <template v-else-if="status.tools.state === 'error'">
          <span class="hint error">{{ t('settings.youtubeOffline.toolsError') }}</span>
          <button
            type="button"
            :disabled="busy"
            data-test="youtube-offline-retry"
            @click="run(() => api!.retryTools())"
          >
            {{ t('settings.youtubeOffline.retry') }}
          </button>
        </template>
        <span v-else class="hint">{{ t('settings.youtubeOffline.toolsMissing') }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.folders-title { margin: 0.25rem 0 0; }
.folders-hint { margin: -0.35rem 0 0; }
.folders {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 0.75rem;
}
.folder-box {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-width: 0;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}
.folder-box.active {
  border-color: var(--ds-color-primary, #04549b);
  background: color-mix(in srgb, var(--ds-color-primary, #04549b) 10%, transparent);
}
.folder-box button.folder-pick {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}
.radio {
  flex: none;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 50%;
}
.active .radio {
  border-color: var(--ds-color-primary, #04549b);
  box-shadow: inset 0 0 0 3px var(--ds-color-surface-card, #201f1f), inset 0 0 0 8px var(--ds-color-primary, #04549b);
}
.folder-name { font-weight: 600; font-size: 0.9rem; }
.badge {
  margin-left: auto;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--ds-color-primary, #04549b);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
}
.folder-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.size { margin-right: auto; font-weight: 600; }
.path {
  min-width: 0;
  max-width: 100%;
  padding: 0.3rem 0.55rem;
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 80%, transparent);
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
  user-select: all;
}
.yt-offline-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hint {
  opacity: 0.7;
  font-size: 0.85rem;
}
.hint.error {
  color: #ff6b6b;
  opacity: 1;
}
.toggle,
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.label {
  font-weight: 600;
  font-size: 0.875rem;
}
.options {
  display: flex;
  gap: 0.5rem;
}
button,
select {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: var(--ds-color-surface-card, #201f1f);
  color: var(--ds-color-on-surface, #e5e2e1);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}
/* A lista aberta do select usa o fundo das opções: sem isto, fica branca. */
select option {
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface, #e5e2e1);
}
button:hover:not(:disabled) {
  filter: brightness(1.2);
}
button.selected {
  background: var(--ds-color-primary, #04549b);
  border-color: transparent;
  color: #fff;
}
button.danger {
  border-color: color-mix(in srgb, #ff6b6b 55%, transparent);
}
button:disabled,
select:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
