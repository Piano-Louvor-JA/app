<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Seta de voltar da tela (slot) com o botão – de minimizar logo abaixo.
 * Usado pelas telas minimizáveis (useMinimizablePage); cada tela mantém a
 * própria seta, este componente só empilha e padroniza o –.
 */
const emit = defineEmits<{
  minimize: []
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
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 80%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }
}
</style>
