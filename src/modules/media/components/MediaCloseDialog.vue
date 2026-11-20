<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useEnterToConfirm } from '@shared/composables/useEnterToConfirm'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useI18n()

// Esc abre este dialog; Enter fecha a música sem clicar em "Sim".
useEnterToConfirm(() => props.open, () => emit('confirm'))
</script>

<template>
  <div
    v-if="open"
    class="media-close-dialog"
    role="dialog"
    aria-modal="true"
    :aria-label="t('media.closeConfirmTitle')"
  >
    <div
      class="media-close-dialog__backdrop"
      aria-hidden="true"
    />
    <div class="media-close-dialog__panel">
      <p class="media-close-dialog__text">
        {{ t('media.closeConfirmTitle') }}
      </p>
      <div class="media-close-dialog__actions">
        <button
          type="button"
          class="media-close-dialog__btn media-close-dialog__btn--no"
          @click="emit('cancel')"
        >
          {{ t('media.closeConfirmNo') }}
        </button>
        <button
          type="button"
          class="media-close-dialog__btn media-close-dialog__btn--yes"
          @click="emit('confirm')"
        >
          {{ t('media.closeConfirmYes') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-close-dialog {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-close-dialog__backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgb(0 0 0 / 0.45);
}

.media-close-dialog__panel {
  position: relative;
  z-index: 1;
  width: min(22rem, calc(100% - 2rem));
  padding: 1.25rem 1.25rem 1rem;
  border-radius: 1rem 0 1rem 0;
  background: #2a2a2a;
  border: 1px solid rgb(255 255 255 / 0.12);
  box-shadow: 0 18px 50px rgb(0 0 0 / 0.5);
}

.media-close-dialog__text {
  margin: 0 0 1.15rem;
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
}

.media-close-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
}

.media-close-dialog__btn {
  border: none;
  border-radius: 999px;
  padding: 0.45rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.media-close-dialog__btn--no {
  background: color-mix(in srgb, #e57373 75%, #4a2a2a);
  color: #1a1a1a;
}

.media-close-dialog__btn--yes {
  background: var(--ds-color-primary, #2196f3);
  color: #fff;
}
</style>
