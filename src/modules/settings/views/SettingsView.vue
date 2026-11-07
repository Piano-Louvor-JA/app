<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { usePageTransition } from '@design-system/composables'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

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

// O estado das abas já vive nas stores; o retrato guarda só a rolagem e a miniatura.
const { minimize, prepare } = useMinimizablePage({
  describe: () => ({
    title: t(`settings.tabs.${activeSection.value}`),
    icon: 'ti-settings',
    summary: t('nav.settings'),
  }),
  capture: () => null,
  fallbackRoute: { name: 'home' },
})
</script>

<template>
  <section
    class="settings-view"
    :class="{ 'settings-view--appearance': isAppearance }"
  >
    <SettingsTabs class="settings-view__tabs" />

    <div
      class="settings-view__header"
      :class="{ 'settings-view__header--floating': isAppearance }"
    >
      <PageBackStack @minimize="minimize" @prepare="prepare">
        <button
          type="button"
          class="settings-view__back"
          :aria-label="t('nav.home')"
          @click="goBack"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
      <h1 v-if="!isAppearance" class="settings-view__title">
        {{ t(sectionTitleKey) }}
      </h1>
      <div id="settings-header-aside" class="settings-view__aside" />
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
  margin-bottom: 2rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--ds-color-outline);
}

.settings-view__header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;

  /* Aparência: sem título; a seta e o – ficam no canto sem empurrar o conteúdo centralizado */
  &--floating {
    position: relative;
    z-index: 2;
    height: 0;
    margin-bottom: 0;
  }
}

.settings-view__title {
  display: flex;
  align-items: center;
}

/* Status da aba (Transmissão): alinhado à seta, à direita do título. */
.settings-view__aside {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  min-height: 2.5rem;
  margin-left: auto;

  &:empty {
    display: none;
  }
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
  padding-top: 4px;
  color: var(--ds-color-on-surface);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 32px;
}

.settings-view__content {
  min-height: 12rem;
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
    padding-top: 7px;
    font-size: 20px;
    line-height: 26px;
  }
}
</style>
