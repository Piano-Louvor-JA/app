<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UtilitiesHubCard from '../components/UtilitiesHubCard.vue'
import type { UtilityHubItem } from '../types/clock'

const { t } = useI18n()

const items: UtilityHubItem[] = [
  {
    key: 'temporizador',
    titleKey: 'utilities.temporizador',
    descriptionKey: 'utilities.temporizadorDescription',
    icon: 'ti-clock-cog',
    to: '/utilities/temporizador',
    available: true,
  },
  {
    key: 'random',
    titleKey: 'utilities.random',
    descriptionKey: 'utilities.randomDescription',
    icon: 'ti-ticket',
    to: '/utilities/random',
    available: true,
  },
  {
    key: 'draw',
    titleKey: 'utilities.draw',
    descriptionKey: 'utilities.drawDescription',
    icon: 'ti-pencil',
    to: null,
    available: false,
  },
  {
    // Issue app#361: card agora (UI nas 3 frentes); funcional liga quando a
    // fase S1 do palco-server (#351) mergear — Browser Source com token.
    key: 'obs',
    titleKey: 'utilities.obs',
    descriptionKey: 'utilities.obsDescription',
    icon: 'ti-brand-windows',
    to: null,
    available: false,
  },
]
</script>

<template>
  <section class="utilities-view">
    <header class="utilities-view__header">
      <h1 class="utilities-view__title">
        {{ t('utilities.title') }}
      </h1>
      <p class="utilities-view__subtitle">
        {{ t('utilities.subtitle') }}
      </p>
    </header>

    <div class="utilities-view__grid">
      <UtilitiesHubCard
        v-for="item in items"
        :key="item.key"
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
.utilities-view {
  display: flex;
  box-sizing: border-box;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: 2rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.utilities-view__header {
  text-align: center;
}

.utilities-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
}

.utilities-view__subtitle {
  margin: 0.5rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  line-height: 1.4;
}

.utilities-view__grid {
  display: grid;
  width: 100%;
  max-width: 48rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  justify-items: center;
  gap: 1rem;
}

@media (max-width: 1280px) {
  .utilities-view {
    gap: 1.15rem;
    padding-bottom: 1.25rem;
  }

  .utilities-view__title {
    font-size: 1.2rem;
  }

  .utilities-view__grid {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
}
</style>
