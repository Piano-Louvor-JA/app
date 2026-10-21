<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { usePageTransition } from '@design-system/composables'

import SettingsTabs from '../components/SettingsTabs.vue'
import { SETTINGS_SECTIONS } from '../constants/sections'
import type { SettingsSectionId } from '../types/settings'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { transitionName } = usePageTransition()

const activeSection = computed<SettingsSectionId>(() => {
  const match = SETTINGS_SECTIONS.find((section) => section.routeName === route.name)
  return match?.id ?? 'appearance'
})

const isAppearance = computed(() => activeSection.value === 'appearance')

const sectionTitleKey = computed(
  () => `settings.sectionTitle.${activeSection.value}`,
)

function goBack() {
  void router.push({ name: 'home' })
}
</script>

<template>
  <section
    class="settings-view"
    :class="{ 'settings-view--appearance': isAppearance }"
  >
    <SettingsTabs class="settings-view__tabs" />

    <div v-if="!isAppearance" class="settings-view__header">
      <button
        type="button"
        class="settings-view__back"
        :aria-label="t('nav.home')"
        @click="goBack"
      >
        <i class="ti ti-arrow-left" aria-hidden="true" />
      </button>
      <h1 class="settings-view__title">
        {{ t(sectionTitleKey) }}
      </h1>
    </div>

    <div class="settings-view__content">
      <RouterView v-slot="{ Component, route: sectionRoute }">
        <Transition :name="transitionName" mode="out-in">
          <component
            :is="Component"
            :key="String(sectionRoute.name ?? sectionRoute.path)"
          />
        </Transition>
      </RouterView>
    </div>
  </section>
</template>

<style scoped lang="scss">
.settings-view {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.5rem var(--ds-spacing-page) 2rem;
  overflow-x: hidden;
  overflow-y: auto;

  &--appearance {
    max-width: 90rem;
  }
}

.settings-view__tabs {
  flex-shrink: 0;
  margin-bottom: 2rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--ds-color-outline);
}

.settings-view__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.settings-view__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 0;
  border-radius: var(--ds-radius-full);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    background-color 200ms ease,
    transform 150ms ease;

  .ti {
    font-size: 22px;
    line-height: 1;
  }

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  }

  &:active {
    transform: scale(0.96);
  }
}

.settings-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 32px;
}

.settings-view__content {
  flex-shrink: 0;
  min-height: 12rem;
  min-width: 0;
}

@media (min-width: 1100px) {
  .settings-view {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    column-gap: 2rem;
    align-content: start;
  }

  .settings-view__tabs {
    grid-column: 1;
    grid-row: 1 / 3;
    align-self: start;
    position: sticky;
    top: 0;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: var(--ds-radius-lg);
    background: var(--ds-color-surface);
  }

  .settings-view__header,
  .settings-view__content { grid-column: 2; }
}

@media (max-width: 1280px) {
  .settings-view {
    padding: 1rem var(--ds-spacing-page) 1.25rem;

    @media (min-width: 960px) {
      padding: 1rem var(--ds-spacing-page) 1.25rem;
    }
  }

  .settings-view__tabs {
    margin-bottom: 1rem;
  }

  .settings-view__header {
    margin-bottom: 1rem;
    gap: 0.75rem;
  }

  .settings-view__title {
    font-size: 20px;
    line-height: 26px;
  }
}
</style>
