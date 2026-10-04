<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useApiConnectivityLifecycle } from '../composables/useApiConnectivity'

// Issue app#321: mensagem simples e compreensível quando a API está fora —
// "sem conexão com o serviço, tentando reconectar". Some sozinho quando volta.
const { t } = useI18n()
const { state } = useApiConnectivityLifecycle()
</script>

<template>
  <div
    v-if="state === 'offline'"
    data-test="api-offline-banner"
    class="api-offline-banner"
    role="status"
  >
    <i class="ti ti-cloud-off" aria-hidden="true" />
    <span class="api-offline-banner__text">{{ t('shared.apiOffline.message') }}</span>
    <span class="api-offline-banner__retry">{{ t('shared.apiOffline.retrying') }}</span>
  </div>
</template>

<style scoped lang="scss">
.api-offline-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1rem;
  background: var(--warning, #b45309);
  color: #fff;
  font-size: 0.85rem;

  &__text {
    font-weight: 600;
  }

  &__retry {
    opacity: 0.85;
    font-size: 0.78rem;
  }
}
</style>
