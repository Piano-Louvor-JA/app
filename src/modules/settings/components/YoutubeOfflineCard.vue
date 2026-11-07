<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appConfirm } from '@shared/composables/useAppConfirm'
import type {
  OnlineVideoQuality,
  OnlineVideoSettings,
  OnlineVideoStatus,
} from '@/shared/types/desktop-bridge'

const QUALITIES: OnlineVideoQuality[] = [480, 720, 1080]
const LIMITS_GB = [2, 4, 6, 10, 20]
const GB = 1024 ** 3

const { t } = useI18n()

const api = window.louvorja?.isElectron ? window.louvorja.onlineVideo : undefined

const status = ref<OnlineVideoStatus | null>(null)
const busy = ref(false)
const unsubscribe: Array<() => void> = []

const visible = computed(() => Boolean(status.value && !status.value.hidden))
const usageText = computed(() => {
  const usage = status.value!.usage
  return t('settings.youtubeOffline.usage', {
    used: (usage.bytes / GB).toFixed(1),
    limit: Math.round(usage.limitBytes / GB),
    count: usage.count,
  })
})

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

async function clearCache() {
  const confirmed = await appConfirm({
    title: t('settings.youtubeOffline.clearTitle'),
    message: t('settings.youtubeOffline.clearMessage'),
    confirmLabel: t('settings.youtubeOffline.clearConfirm'),
    cancelLabel: t('settings.youtubeOffline.cancel'),
    danger: true,
  })
  if (confirmed) await run(() => api!.clear())
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

      <label class="row">
        <span class="label">{{ t('settings.youtubeOffline.limit') }}</span>
        <select
          :value="status.settings.limitGb"
          :disabled="busy"
          data-test="youtube-offline-limit"
          @change="update({ limitGb: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="gb in LIMITS_GB" :key="gb" :value="gb">{{ gb }} GB</option>
        </select>
      </label>

      <div class="row">
        <span class="hint" data-test="youtube-offline-usage">{{ usageText }}</span>
        <button
          type="button"
          class="danger"
          :disabled="busy || status.usage.count === 0"
          data-test="youtube-offline-clear"
          @click="clearCache"
        >
          {{ t('settings.youtubeOffline.clear') }}
        </button>
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
  background: transparent;
  color: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
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
