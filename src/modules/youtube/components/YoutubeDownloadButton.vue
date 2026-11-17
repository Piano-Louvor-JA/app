<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OnlineVideoItemStatus } from '@shared/types/desktop-bridge'

import { isDownloading } from '../composables/useYoutubeDownloads'

const props = defineProps<{ status?: OnlineVideoItemStatus }>()
const emit = defineEmits<{ download: []; cancel: [] }>()
const { t } = useI18n()

const busy = computed(() => isDownloading(props.status))
const ready = computed(() => props.status?.state === 'ready')
const failed = computed(() => props.status?.state === 'error')
const percent = computed(() => Math.round((props.status?.progress ?? 0) * 100))

const title = computed(() => {
  if (ready.value) return t('youtube.download.done')
  if (busy.value) return t('youtube.download.progress', { n: percent.value })
  if (failed.value) return t('youtube.download.failed')
  return t('youtube.download.action')
})

function onClick() {
  if (ready.value) return
  if (busy.value) emit('cancel')
  else emit('download')
}
</script>

<template>
  <button
    type="button"
    class="yt-dl"
    :class="{ 'is-busy': busy, 'is-ready': ready, 'is-failed': failed }"
    :style="busy ? { '--yt-dl-progress': `${percent}%` } : undefined"
    :aria-label="title"
    :title="busy ? `${title} — ${t('youtube.download.cancel')}` : title"
    data-testid="youtube-download"
    @click="onClick"
  >
    <i v-if="ready" class="ti ti-circle-check" aria-hidden="true" />
    <span v-else-if="busy" class="yt-dl__pct">{{ percent }}</span>
    <i v-else class="ti ti-download" aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
.yt-dl {
  flex: none;
  position: relative;
  width: 2.1rem;
  height: 2.1rem;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  line-height: 0;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;

  .ti {
    display: block;
    width: 1.1rem;
    height: 1.1rem;
    font-size: 1.1rem;
    line-height: 1.1rem;
    transform: translateY(1px);
  }

  &:hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }

  // Em andamento: anel de progresso na cor de realce.
  &.is-busy {
    border-color: transparent;
    background:
      radial-gradient(closest-side, var(--ds-color-surface-card, #201f1f) 78%, transparent 80%),
      conic-gradient(var(--ds-color-primary) var(--yt-dl-progress, 0%), color-mix(in srgb, var(--ds-color-primary) 18%, transparent) 0);
    color: var(--ds-color-on-surface);
  }

  &.is-busy:hover .yt-dl__pct { display: none; }
  &.is-busy:hover::after {
    content: '✕';
    font-size: 0.8rem;
    line-height: 1;
    color: var(--ds-color-error, #e5484d);
  }

  &.is-ready {
    border-color: color-mix(in srgb, #22c55e 55%, transparent);
    color: #22c55e;
    cursor: default;
  }

  &.is-failed {
    border-color: color-mix(in srgb, var(--ds-color-error, #e5484d) 55%, transparent);
    color: var(--ds-color-error, #e5484d);
  }
}

.yt-dl__pct {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}
</style>
