<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import StageCustomizationCard from './StageCustomizationCard.vue'

/**
 * Atalho contextual de personalização de palco: a paleta de cada módulo
 * abre o mesmo StageCustomizationCard de /config, já na tab daquele escopo.
 * (Substitui gradualmente os *ConfigDialog legados de bgColor/textColor.)
 */

defineProps<{
  open: boolean
  /** Escopo do módulo que abriu o atalho (ex.: 'clock', 'timer', 'countdown'). */
  scope: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

function teleportTarget() {
  return document.fullscreenElement || 'body'
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport :to="teleportTarget()">
    <Transition name="stage-shortcut-fade">
      <div
        v-if="open"
        class="stage-shortcut"
        role="dialog"
        aria-modal="true"
        :aria-label="t('settings.stage.title')"
        @keydown="onKeydown"
      >
        <div
          class="stage-shortcut__backdrop"
          @click="emit('close')"
        />
        <GlassCard
          class="stage-shortcut__panel"
          elevated
          :padding="false"
        >
          <header class="stage-shortcut__header">
            <div class="stage-shortcut__heading">
              <div class="stage-shortcut__heading-icon">
                <i
                  class="ti ti-palette"
                  aria-hidden="true"
                />
              </div>
              <h2>{{ t('settings.stage.title') }}</h2>
            </div>

            <button
              type="button"
              class="stage-shortcut__close"
              :aria-label="t('common.cancel')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="stage-shortcut__body">
            <StageCustomizationCard :only-scope="scope" />
          </div>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.stage-shortcut {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.stage-shortcut__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(3px);
}

.stage-shortcut__panel {
  position: relative;
  display: flex;
  width: min(64rem, 100%);
  max-height: min(88vh, 52rem);
  overflow: hidden;
  flex-direction: column;
}

.stage-shortcut__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
}

.stage-shortcut__heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  h2 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 1.1rem;
    font-weight: 700;
  }
}

.stage-shortcut__heading-icon {
  display: flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.15rem;
  }
}

.stage-shortcut__close {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition: background-color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  }
}

.stage-shortcut__body {
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1.25rem 1.25rem;
}

.stage-shortcut-fade-enter-active,
.stage-shortcut-fade-leave-active {
  transition: opacity 180ms ease;
}

.stage-shortcut-fade-enter-from,
.stage-shortcut-fade-leave-to {
  opacity: 0;
}
</style>
