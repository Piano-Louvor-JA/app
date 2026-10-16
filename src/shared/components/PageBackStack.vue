<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Seta de voltar da tela (slot) com o botão – de minimizar logo abaixo.
 * Usado pelas telas minimizáveis (useMinimizablePage); cada tela mantém a
 * própria seta, este componente só empilha e padroniza o –.
 */
const emit = defineEmits<{
  minimize: []
  /** Mouse entrou no – ou ele ganhou foco: antecipar a miniatura. */
  prepare: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="page-back-stack">
    <slot />
    <button
      type="button"
      class="page-back-stack__minimize"
      :aria-label="t('minimize.page')"
      :title="t('minimize.page')"
      @click="emit('minimize')"
      @pointerenter="emit('prepare')"
      @focus="emit('prepare')"
    >
      <i class="ti ti-minus" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.page-back-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.page-back-stack__minimize {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  /* destaque: cor do tema, para não se perder ao lado da seta de voltar */
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 60%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  color: var(--ds-color-primary);
  font-size: 1.15rem;
  cursor: pointer;
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    color var(--ds-motion-duration, 280ms) ease;

  &:hover {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-back-stack__minimize {
    transition: none;
  }
}
</style>
