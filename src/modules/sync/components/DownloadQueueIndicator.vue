<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  cancelDownload,
  clearFinishedDownloads,
  retryDownload,
  subscribeDownloadQueue,
  type DownloadQueueItem,
} from '../services/download-queue-service'

/**
 * app#338: widget observável da fila de downloads — header global.
 * Estados: N pendentes (badge) → painel com progresso por item, retry
 * pra falhas, cancelar pendentes e limpar concluídos.
 */

const { t } = useI18n()

const items = ref<DownloadQueueItem[]>([])
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = subscribeDownloadQueue((snapshot) => {
    items.value = snapshot
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})

const activeCount = computed(
  () =>
    items.value.filter(
      (item) => item.status === 'pending' || item.status === 'running',
    ).length,
)

const failedCount = computed(
  () => items.value.filter((item) => item.status === 'failed').length,
)

const expanded = ref(false)

const visibleItems = computed(() =>
  [...items.value]
    .sort((a, b) => {
      const rank: Record<string, number> = {
        running: 0,
        pending: 1,
        failed: 2,
        done: 3,
      }
      return rank[a.status] - rank[b.status]
    })
    .slice(0, 20),
)

function onRetry(item: DownloadQueueItem) {
  retryDownload(item.id)
}

function onCancel(item: DownloadQueueItem) {
  cancelDownload(item.id)
}
</script>

<template>
  <div v-if="items.length > 0" class="download-queue-indicator">
    <button
      type="button"
      class="download-queue-indicator__button"
      :class="{ 'download-queue-indicator__button--has-failed': failedCount > 0 }"
      :title="t('sync.downloadQueue.title')"
      data-testid="download-queue-button"
      @click="expanded = !expanded"
    >
      <i class="ti ti-cloud-download" aria-hidden="true" />
      <span v-if="activeCount > 0" class="download-queue-indicator__badge">
        {{ activeCount }}
      </span>
      <i
        v-else-if="failedCount > 0"
        class="ti ti-alert-triangle"
        aria-hidden="true"
      />
    </button>

    <div v-if="expanded" class="download-queue-indicator__panel">
      <div class="download-queue-indicator__header">
        <strong>{{ t('sync.downloadQueue.title') }}</strong>
        <button
          type="button"
          class="download-queue-indicator__clear"
          @click="clearFinishedDownloads()"
        >
          {{ t('sync.downloadQueue.clearFinished') }}
        </button>
      </div>

      <ul class="download-queue-indicator__list">
        <li
          v-for="item in visibleItems"
          :key="item.id"
          class="download-queue-indicator__item"
          :data-status="item.status"
        >
          <i
            class="download-queue-indicator__icon"
            :class="{
              'ti ti-loader': item.status === 'running',
              'ti ti-clock': item.status === 'pending',
              'ti ti-check': item.status === 'done',
              'ti ti-alert-triangle': item.status === 'failed',
            }"
            aria-hidden="true"
          />
          <span class="download-queue-indicator__label">{{ item.label }}</span>
          <button
            v-if="item.status === 'failed'"
            type="button"
            class="download-queue-indicator__action"
            @click="onRetry(item)"
          >
            {{ t('sync.downloadQueue.retry') }}
          </button>
          <button
            v-else-if="item.status === 'pending'"
            type="button"
            class="download-queue-indicator__action"
            @click="onCancel(item)"
          >
            {{ t('sync.downloadQueue.cancel') }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.download-queue-indicator {
  position: relative;
  display: inline-flex;
}

.download-queue-indicator__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: var(--ds-radius-full, 999px);
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 1.05rem;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 15%, transparent);
  }

  &--has-failed {
    color: var(--ds-color-error);
  }
}

.download-queue-indicator__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 0.9rem;
  height: 0.9rem;
  padding: 0 3px;
  border-radius: var(--ds-radius-full, 999px);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #fff);
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 0.9rem;
  text-align: center;
}

.download-queue-indicator__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  width: 280px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 12px);
  background: var(--ds-color-surface-card);
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
}

.download-queue-indicator__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ds-color-outline);
  font-size: 0.82rem;
  color: var(--ds-color-on-surface);
}

.download-queue-indicator__clear {
  border: none;
  background: none;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.72rem;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.download-queue-indicator__list {
  margin: 0;
  padding: 4px;
  list-style: none;
}

.download-queue-indicator__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--ds-radius-sm, 8px);
  font-size: 0.78rem;
  color: var(--ds-color-on-surface);

  &[data-status='failed'] {
    color: var(--ds-color-error);
  }

  &[data-status='done'] {
    opacity: 0.65;
  }
}

.download-queue-indicator__icon {
  flex: none;
  font-size: 0.9rem;
}

.download-queue-indicator__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-queue-indicator__action {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-full, 999px);
  background: none;
  color: var(--ds-color-on-surface);
  font-size: 0.68rem;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  }
}
</style>
