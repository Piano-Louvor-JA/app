<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UtilitiesHubCard from '@modules/clock/components/UtilitiesHubCard.vue'
import type { UtilityHubItem } from '@modules/clock/types/clock'

/**
 * Conexões remotas: agregador de módulos (como Utilitários) com
 * Transmissão, Controle Remoto e Palco.
 */
const { t } = useI18n()

const items: UtilityHubItem[] = [
  {
    key: 'transmission',
    titleKey: 'settings.tabs.transmission',
    descriptionKey: 'settings.connections.transmissionDescription',
    icon: 'ti-broadcast',
    to: '/settings/transmission',
    available: true,
  },
  {
    key: 'remote',
    titleKey: 'settings.tabs.remote',
    descriptionKey: 'settings.connections.remoteDescription',
    icon: 'ti-device-gamepad-2',
    to: '/settings/remote',
    available: true,
  },
  {
    key: 'palco',
    titleKey: 'settings.tabs.palco',
    descriptionKey: 'settings.connections.palcoDescription',
    icon: 'ti-device-tv',
    to: '/settings/palco',
    available: true,
  },
]
</script>

<template>
  <section class="connections-view" data-testid="connections-view">
    <p class="connections-view__subtitle">{{ t('settings.connections.subtitle') }}</p>
    <div class="connections-view__grid">
      <UtilitiesHubCard
        v-for="item in items"
        :key="item.key"
        :data-testid="`connections-card-${item.key}`"
        :title-key="item.titleKey"
        :description-key="item.descriptionKey"
        :icon="item.icon"
        :to="item.to"
        :available="item.available"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.connections-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  padding-bottom: 2rem;
}

.connections-view__subtitle {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  text-align: center;
}

.connections-view__grid {
  display: grid;
  width: 100%;
  max-width: 52rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  justify-items: center;
  gap: 1rem;
}
</style>
