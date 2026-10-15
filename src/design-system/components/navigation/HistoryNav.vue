<script setup lang="ts">
import type { HistoryNavDot } from '@design-system/types/navigation'

/**
 * Setas voltar/avançar + pontos do histórico de navegação (acima do dock).
 * Só apresentação: quem decide estado e navegação é o AppShell.
 */
defineProps<{
  dots: HistoryNavDot[]
  canGoBack: boolean
  canGoForward: boolean
  ariaLabel: string
  backLabel: string
  forwardLabel: string
}>()

const emit = defineEmits<{
  back: []
  forward: []
  go: [index: number]
}>()

function onDot(dot: HistoryNavDot) {
  if (!dot.current) emit('go', dot.index)
}
</script>

<template>
  <nav class="ds-history-nav" :aria-label="ariaLabel">
    <button
      type="button"
      class="ds-history-nav__arrow ds-history-nav__arrow--back"
      :aria-label="backLabel"
      :title="backLabel"
      :disabled="!canGoBack"
      @click="emit('back')"
    >
      <i class="ti ti-arrow-left" aria-hidden="true" />
    </button>

    <ol class="ds-history-nav__dots">
      <li v-for="dot in dots" :key="dot.index">
        <button
          type="button"
          class="ds-history-nav__dot"
          :class="{
            'ds-history-nav__dot--current': dot.current,
            'ds-history-nav__dot--edge': dot.edge,
          }"
          :title="dot.label"
          :aria-label="dot.label"
          :aria-current="dot.current ? 'page' : undefined"
          @click="onDot(dot)"
        />
      </li>
    </ol>

    <button
      type="button"
      class="ds-history-nav__arrow ds-history-nav__arrow--forward"
      :aria-label="forwardLabel"
      :title="forwardLabel"
      :disabled="!canGoForward"
      @click="emit('forward')"
    >
      <i class="ti ti-arrow-right" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped lang="scss">
.ds-history-nav {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  height: var(--ds-history-nav-height, 32px);
  padding: 0 0.5rem;
}

.ds-history-nav__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 18px;
  cursor: pointer;
  transition:
    color var(--ds-motion-duration, 280ms) ease,
    background-color var(--ds-motion-duration, 280ms) ease;

  &:hover:not(:disabled) {
    color: var(--ds-color-on-surface);
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.ds-history-nav__dots {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Área clicável 24×24; o ponto desenhado é o ::before. */
.ds-history-nav__dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  cursor: pointer;

  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--ds-color-on-surface-variant);
    border-radius: 9999px;
    transition:
      width var(--ds-motion-duration, 280ms) ease,
      height var(--ds-motion-duration, 280ms) ease,
      background-color var(--ds-motion-duration, 280ms) ease,
      border-color var(--ds-motion-duration, 280ms) ease;
  }

  &:hover::before {
    border-color: var(--ds-color-on-surface);
  }

  &--edge::before {
    width: 5px;
    height: 5px;
  }

  &--current {
    cursor: default;

    &::before {
      width: 14px;
      height: 14px;
      border-color: var(--ds-color-primary);
      background: var(--ds-color-primary);
    }
  }
}

.ds-history-nav__arrow:focus-visible,
.ds-history-nav__dot:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .ds-history-nav__arrow,
  .ds-history-nav__dot::before {
    transition: none;
  }
}
</style>
