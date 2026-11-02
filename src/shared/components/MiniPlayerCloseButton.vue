<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirm from './AppConfirm.vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const confirming = ref(false)
function confirm() {
  confirming.value = false
  emit('close')
}
</script>

<template>
  <button type="button" class="mini-player-close" :aria-label="t('common.close')"
    :title="t('common.close')" @click.stop="confirming = true" @dblclick.stop>
    <i class="ti ti-x" aria-hidden="true" />
  </button>
  <AppConfirm :z-index="120" :open="confirming"
    :title="t('floating.closeTitle', { title: label })" :message="t('floating.closeMessage')"
    :confirm-label="t('common.close')" :cancel-label="t('common.cancel')" danger
    @confirm="confirm" @cancel="confirming = false" />
</template>

<style scoped>
.mini-player-close {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.35rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid #b77b76;
  border-radius: 50%;
  background: #69413e;
  color: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
  pointer-events: auto;
  cursor: pointer;
}
.mini-player-close:hover { background: #85534e; border-color: #d6a29c; }
</style>
