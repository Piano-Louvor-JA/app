<script setup lang="ts">
import AppIcon from '@design-system/components/AppIcon.vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { VISIBLE_SETTINGS_SECTIONS } from '../constants/sections'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const icons = { appearance: 'ti-palette', general: 'ti-settings', media: 'ti-player-play', projection: 'ti-device-desktop', remote: 'ti-device-mobile' }

function isActive(routeName: string) {
  return route.name === routeName
}

function goTo(routeName: string) {
  if (route.name !== routeName) {
    void router.push({ name: routeName })
  }
}
</script>

<template>
  <nav class="settings-tabs" :aria-label="t('settings.title')">
    <button
      v-for="section in VISIBLE_SETTINGS_SECTIONS"
      :key="section.id"
      type="button"
      class="settings-tabs__item"
      :class="{ 'settings-tabs__item--active': isActive(section.routeName) }"
      :aria-current="isActive(section.routeName) ? 'page' : undefined"
      @click="goTo(section.routeName)"
    >
      <AppIcon :name="icons[section.id as keyof typeof icons]" aria-hidden="true" />
      {{ t(section.labelKey) }}
    </button>
  </nav>
</template>

<style scoped lang="scss">
.settings-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.5rem 1.5rem;
  min-height: 2.5rem;
}

.settings-tabs__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.25rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 20px;
  text-transform: none;
  transition:
    color 200ms ease,
    border-color 200ms ease;

  &:hover {
    color: var(--ds-color-on-surface);
  }

  &--active {
    color: var(--ds-color-on-surface);
    font-weight: 700;
    border-bottom-color: var(--ds-color-primary);
  }
}

@media (min-width: 1100px) {
  .settings-tabs { flex-direction: column; gap: 0.5rem; }
  .settings-tabs__item {
    padding: 0.85rem 0.75rem;
    text-align: left;
    border-radius: var(--ds-radius-lg);
    border-bottom: 0;
  }
  .settings-tabs__item--active {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    color: var(--ds-color-primary);
  }
}
</style>
