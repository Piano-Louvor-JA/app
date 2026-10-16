<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

import UtilitiesHubCard from '../components/UtilitiesHubCard.vue'
import type { UtilityHubItem } from '../types/clock'

const { t } = useI18n()

// Minimizar: o estado da tela já vive na store; o retrato guarda só rolagem e miniatura.
const { minimize, prepare } = useMinimizablePage({
  describe: () => ({ title: t('utilities.temporizador'), icon: 'ti-clock-cog', summary: '' }),
  capture: () => null,
  fallbackRoute: { name: 'utilities' },
})
const router = useRouter()

const items: UtilityHubItem[] = [
  {
    key: 'clock',
    titleKey: 'utilities.clock',
    descriptionKey: 'utilities.clockDescription',
    icon: 'ti-clock',
    to: '/utilities/clock',
    available: true,
  },
  {
    key: 'timer',
    titleKey: 'utilities.timer',
    descriptionKey: 'utilities.timerDescription',
    icon: 'ti-clock',
    to: '/utilities/timer',
    available: true,
  },
  {
    key: 'countdown',
    titleKey: 'utilities.countdown',
    descriptionKey: 'utilities.countdownDescription',
    icon: 'ti-hourglass',
    to: '/utilities/countdown',
    available: true,
  },
]

function goBack() {
  void router.push({ name: 'utilities' })
}
</script>

<template>
  <section class="temporizador-view">
    <header class="temporizador-view__header">
      <PageBackStack @minimize="minimize" @prepare="prepare">
        <button
          type="button"
          class="temporizador-view__back"
          :aria-label="t('utilities.backToUtilities')"
          @click="goBack"
        >
          <i
            class="ti ti-arrow-left"
            aria-hidden="true"
          />
        </button>
      </PageBackStack>

      <div class="temporizador-view__heading">
        <h1 class="temporizador-view__title">
          {{ t('utilities.temporizador') }}
        </h1>
        <p class="temporizador-view__subtitle">
          {{ t('utilities.temporizadorSubtitle') }}
        </p>
      </div>
    </header>

    <div class="temporizador-view__grid">
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
.temporizador-view {
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

.temporizador-view__header {
  display: grid;
  width: 100%;
  max-width: 48rem;
  grid-template-columns: 2.5rem 1fr 2.5rem;
  align-items: start;
  gap: 0.75rem;
}

.temporizador-view__back {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-size: 1.35rem;
  transition: background-color 180ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}

.temporizador-view__heading {
  text-align: center;
}

.temporizador-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
}

.temporizador-view__subtitle {
  margin: 0.5rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  line-height: 1.4;
}

.temporizador-view__grid {
  display: grid;
  width: 100%;
  max-width: 48rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  justify-items: center;
  gap: 1rem;
}

@media (max-width: 1280px) {
  .temporizador-view {
    gap: 1.15rem;
    padding-bottom: 1.25rem;
  }

  .temporizador-view__title {
    font-size: 1.2rem;
  }

  .temporizador-view__grid {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
}
</style>
