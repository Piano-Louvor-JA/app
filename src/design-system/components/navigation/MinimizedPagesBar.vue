<script setup lang="ts">
import { ref } from 'vue'

import type { MinimizedBarItem } from '@design-system/types/navigation'

/**
 * Barra de páginas minimizadas (entre a faixa de histórico e o dock).
 * Só apresentação: quem decide abrir/fechar é o AppShell.
 * Mouse em cima ou foco no item mostram a prévia e o x.
 */
defineProps<{
  items: MinimizedBarItem[]
  navLabel: string
}>()

const emit = defineEmits<{
  open: [key: string]
  close: [key: string]
}>()

/** Item com a prévia aberta (mouse ou foco). */
const activeKey = ref<string | null>(null)

function show(key: string) {
  activeKey.value = key
}

function hide(key: string) {
  if (activeKey.value === key) activeKey.value = null
}

function onFocusOut(key: string, event: FocusEvent) {
  const slot = event.currentTarget as HTMLElement
  // foco indo para o x (dentro do mesmo item) mantém a prévia
  if (event.relatedTarget instanceof Node && slot.contains(event.relatedTarget)) return
  hide(key)
}

function onItemKeydown(key: string, event: KeyboardEvent) {
  if (event.key === 'Delete') emit('close', key)
}
</script>

<template>
  <nav class="ds-minimized-bar" :aria-label="navLabel">
    <ul class="ds-minimized-bar__list">
      <li
        v-for="item in items"
        :key="item.key"
        class="ds-minimized-bar__slot"
        @mouseenter="show(item.key)"
        @mouseleave="hide(item.key)"
        @focusin="show(item.key)"
        @focusout="onFocusOut(item.key, $event)"
      >
        <button
          type="button"
          class="ds-minimized-bar__item"
          :aria-label="item.title"
          @click="emit('open', item.key)"
          @keydown="onItemKeydown(item.key, $event)"
        >
          <i class="ti" :class="item.icon" aria-hidden="true" />
          <span class="ds-minimized-bar__title">{{ item.title }}</span>
        </button>

        <button
          v-if="activeKey === item.key"
          type="button"
          class="ds-minimized-bar__close"
          :aria-label="item.closeLabel"
          :title="item.closeLabel"
          @click.stop="emit('close', item.key)"
        >
          <i class="ti ti-x" aria-hidden="true" />
        </button>

        <div
          v-if="activeKey === item.key"
          class="ds-minimized-bar__preview"
          role="tooltip"
        >
          <img
            v-if="item.preview"
            class="ds-minimized-bar__preview-image"
            :src="item.preview"
            alt=""
          >
          <div v-else class="ds-minimized-bar__preview-icon">
            <i class="ti" :class="item.icon" aria-hidden="true" />
          </div>
          <strong class="ds-minimized-bar__preview-title">{{ item.title }}</strong>
          <span v-if="item.summary" class="ds-minimized-bar__preview-summary">{{ item.summary }}</span>
        </div>
      </li>
    </ul>
  </nav>
</template>

<style scoped lang="scss">
.ds-minimized-bar {
  display: flex;
  justify-content: center;
  height: var(--ds-minimized-bar-height, 40px);
  padding: 0 0.5rem;
}

.ds-minimized-bar__list {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-minimized-bar__slot {
  position: relative;
  display: flex;
  align-items: center;
}

.ds-minimized-bar__item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 13rem;
  height: 30px;
  padding: 0 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    border-color var(--ds-motion-duration, 280ms) ease;

  .ti {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--ds-color-primary);
  }

  &:hover {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, var(--ds-color-surface-card));
  }
}

.ds-minimized-bar__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-minimized-bar__close {
  position: absolute;
  top: -6px;
  right: -6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 12px;
  cursor: pointer;
}

.ds-minimized-bar__preview {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 240px;
  padding: 0.5rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.75rem;
  background: var(--ds-color-surface-card);
  box-shadow: 0 12px 32px color-mix(in srgb, #000 45%, transparent);
  transform: translateX(-50%);
  pointer-events: none;
}

.ds-minimized-bar__preview-image {
  width: 100%;
  border-radius: 0.5rem;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: top;
}

.ds-minimized-bar__preview-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);
  font-size: 40px;
}

.ds-minimized-bar__preview-title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-minimized-bar__preview-summary {
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
}

.ds-minimized-bar__item:focus-visible,
.ds-minimized-bar__close:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .ds-minimized-bar__item {
    transition: none;
  }
}
</style>
