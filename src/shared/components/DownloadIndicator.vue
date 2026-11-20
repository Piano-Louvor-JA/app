<script setup lang="ts">
/**
 * Indicador global de downloads em background (T5/SPEC R2).
 * Header principal: ícone + % quando ativo; popover com item atual,
 * falhas e ações (cancelar/retry). Web: nada renderiza.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDownloadStore } from '@shared/stores/useDownloadStore'

const { t } = useI18n()
const store = useDownloadStore()
const open = ref(false)

onMounted(() => {
  void store.init()
})

const label = computed(() =>
  t('download.indicatorTitle', { done: store.done, total: store.total, percent: store.percent }),
)
</script>

<template>
  <div
    v-if="store.active"
    class="download-indicator"
    data-test="download-indicator"
  >
    <button
      type="button"
      class="download-indicator__btn"
      :aria-label="label"
      :title="label"
      data-test="download-indicator-btn"
      @click="open = !open"
    >
      <i
        class="ti ti-download"
        aria-hidden="true"
      />
      <span
        class="download-indicator__percent"
        data-test="download-indicator-percent"
      >{{ store.percent }}%</span>
      <span
        v-if="store.failedCount > 0"
        class="download-indicator__failed-dot"
        data-test="download-indicator-failed"
      />
    </button>
    <div
      v-if="open"
      class="download-indicator__popover"
      data-test="download-indicator-popover"
    >
      <p class="download-indicator__file">
        {{ store.currentFileName || t('download.indicatorIdle') }}
      </p>
      <p class="download-indicator__counts">
        {{ t('download.indicatorCounts', { done: store.done, total: store.total }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.download-indicator {
  position: relative;
  display: inline-flex;
}

.download-indicator__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: 9999px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
}

.download-indicator__btn:hover {
  border-color: var(--accent);
}

.download-indicator__failed-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 9999px;
  background: #e5484d;
}

.download-indicator__popover {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  min-width: 14rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  z-index: 50;
  font-size: 0.8rem;
}

.download-indicator__file {
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 16rem;
}

.download-indicator__counts {
  margin: 0;
  opacity: 0.7;
}
</style>
