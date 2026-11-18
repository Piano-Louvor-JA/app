<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { OnlineVideoFolderInfo, OnlineVideoStatus } from '@shared/types/desktop-bridge'

/**
 * Espaço em disco dos vídeos baixados: o total das duas pastas no botão; clicando, o tamanho de
 * cada uma (sistema e personalizada). Atualiza sozinho quando um download termina.
 */
const { t } = useI18n()
const router = useRouter()

const api = window.louvorja?.isElectron ? window.louvorja.onlineVideo : undefined
const status = ref<OnlineVideoStatus | null>(null)
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const GB = 1024 ** 3
const MB = 1024 ** 2

type StorageRow = { key: 'system' | 'custom'; info: OnlineVideoFolderInfo }

const rows = computed<StorageRow[]>(() => {
  const st = status.value
  if (!st) return []
  const system: OnlineVideoFolderInfo = st.folders?.system ?? {
    dir: st.cacheDir ?? '',
    bytes: st.usage.bytes,
    count: st.usage.count,
    limitBytes: st.usage.limitBytes,
  }
  const list: StorageRow[] = [{ key: 'system', info: system }]
  if (st.folders?.custom) list.push({ key: 'custom', info: st.folders.custom })
  return list
})

const total = computed(() => rows.value.reduce(
  (acc, row) => ({ bytes: acc.bytes + row.info.bytes, count: acc.count + row.info.count }),
  { bytes: 0, count: 0 },
))

const visible = computed(() => Boolean(status.value && !status.value.hidden && status.value.available))

function formatSize(bytes: number) {
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`
}

async function refresh() {
  if (!api) return
  try {
    status.value = await api.status()
  } catch {
    status.value = null
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) void refresh()
}

function openFolder(key: 'system' | 'custom') {
  void api?.openFolder?.(key)?.catch(() => {})
}

function openSettings() {
  open.value = false
  void router.push({ name: 'settings-media' })
}

function onDocClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}

let stopChanged: (() => void) | undefined
onMounted(() => {
  void refresh()
  stopChanged = api?.onChanged?.(({ status: item }) => {
    if (item.state === 'ready') void refresh()
  })
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  stopChanged?.()
  document.removeEventListener('click', onDocClick)
})

defineExpose({ refresh })
</script>

<template>
  <div v-if="visible" ref="root" class="yt-storage">
    <button
      type="button"
      class="yt-storage__btn"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      :title="t('youtube.storage.hint')"
      data-testid="youtube-storage"
      @click="toggle"
    >
      <i class="ti ti-database" aria-hidden="true" />
      <span class="yt-storage__total" data-testid="youtube-storage-total">{{ formatSize(total.bytes) }}</span>
      <i class="ti ti-chevron-down yt-storage__chev" aria-hidden="true" />
    </button>

    <div v-if="open" class="yt-storage__panel" role="dialog" :aria-label="t('youtube.storage.title')">
      <p class="yt-storage__title">{{ t('youtube.storage.title') }}</p>
      <ul class="yt-storage__list">
        <li v-for="row in rows" :key="row.key" class="yt-storage__row" :data-testid="`youtube-storage-${row.key}`">
          <div class="yt-storage__row-head">
            <strong>{{ t(row.key === 'system' ? 'settings.youtubeOffline.folderSystem' : 'settings.youtubeOffline.folderCustom') }}</strong>
            <span class="yt-storage__size">{{ formatSize(row.info.bytes) }}</span>
          </div>
          <code :title="row.info.dir">{{ row.info.dir }}</code>
          <div class="yt-storage__row-foot">
            <small>{{ t('youtube.storage.videos', { n: row.info.count }) }}</small>
            <button v-if="api?.openFolder" type="button" class="yt-storage__link" @click="openFolder(row.key)">
              <i class="ti ti-folder" aria-hidden="true" />
              {{ t('settings.youtubeOffline.openFolder') }}
            </button>
          </div>
        </li>
      </ul>
      <div class="yt-storage__sum">
        <span>{{ t('youtube.storage.total', { n: total.count }) }}</span>
        <strong>{{ formatSize(total.bytes) }}</strong>
      </div>
      <button type="button" class="yt-storage__link yt-storage__settings" @click="openSettings">
        <i class="ti ti-settings" aria-hidden="true" />
        {{ t('youtube.download.manage') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.yt-storage { position: relative; }

.yt-storage__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ds-color-surface-card) 70%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  .ti { color: var(--ds-color-primary); font-size: 1.1rem; }
  &:hover, &.is-open { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
}

.yt-storage__chev { font-size: 0.9rem !important; color: var(--ds-color-on-surface-variant) !important; transition: transform 150ms ease; }
.is-open .yt-storage__chev { transform: rotate(180deg); }

.yt-storage__panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  width: min(26rem, 90vw);
  padding: 0.9rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 14px 40px rgb(0 0 0 / 45%);
}

.yt-storage__title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-color-on-surface-variant);
}

.yt-storage__list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }

.yt-storage__row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.55rem;
  code {
    padding: 0.2rem 0.45rem;
    border-radius: 0.3rem;
    background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.74rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small { font-size: 0.76rem; color: var(--ds-color-on-surface-variant); }
}

.yt-storage__row-head,
.yt-storage__row-foot,
.yt-storage__sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.yt-storage__row-head strong { font-size: 0.88rem; }
.yt-storage__size { font-weight: 700; color: var(--ds-color-primary); }

.yt-storage__sum {
  padding-top: 0.55rem;
  border-top: 1px solid var(--ds-color-outline);
  font-size: 0.88rem;
  strong { font-size: 1rem; color: var(--ds-color-primary); }
}

.yt-storage__link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-primary);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { text-decoration: underline; }
}
.yt-storage__settings { align-self: flex-start; }
</style>
