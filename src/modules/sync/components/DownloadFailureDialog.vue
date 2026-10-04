<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DownloadFailureNotice } from '../types/library'

const props = defineProps<{
  failure: DownloadFailureNotice | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const open = computed(() => props.failure != null)

const message = computed(() => {
  const failure = props.failure
  if (!failure) return ''

  if (failure.reason === 'offline') {
    return t('sync.errors.downloadOffline')
  }

  if (failure.reason === 'batchOffline') {
    return t('sync.errors.batchOffline')
  }

  if (failure.reason === 'server') {
    return t('sync.errors.downloadServer', { count: failure.failedCount })
  }

  return t('sync.errors.downloadUnknown')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="download-failure-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('sync.errors.downloadFailureTitle')"
    >
      <div
        class="download-failure-dialog__backdrop"
        aria-hidden="true"
      />
      <div class="download-failure-dialog__panel">
        <h2 class="download-failure-dialog__title">
          {{ t('sync.errors.downloadFailureTitle') }}
        </h2>
        <p class="download-failure-dialog__text">
          {{ message }}
        </p>
        <div class="download-failure-dialog__actions">
          <!-- /* v8 ignore next */ arrow de template: comportamento provado
               pelo teste de close (fantasma de source map) -->
          <button
            type="button"
            class="download-failure-dialog__btn"
            @click="emit('close')"
          >
            {{ t('sync.close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.download-failure-dialog {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.download-failure-dialog__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(0 0 0 / 45%);
}

.download-failure-dialog__panel {
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

.download-failure-dialog__title {
  margin: 0 0 0.75rem;
  color: var(--ds-color-on-surface);
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

.download-failure-dialog__text {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 20px;
}

.download-failure-dialog__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.download-failure-dialog__btn {
  height: 2.25rem;
  padding: 0 1.1rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
  color: var(--ds-color-error, #ffb4ab);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 200ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 28%, transparent);
  }
}
</style>
