<script setup lang="ts">
/**
 * Nome do recurso acima de uma prévia flutuante (Relógio, Timer, Bíblia…).
 * Posicionado em relação ao contêiner fixo da prévia: não muda o layout nem
 * o arrastar.
 */
defineProps<{
  label: string
}>()
</script>

<template>
  <span class="floating-preview-title">{{ label }}</span>
</template>

<style scoped lang="scss">
.floating-preview-title {
  position: absolute;
  bottom: calc(100% + 0.35rem);
  left: 0;
  max-width: 16rem;
  overflow: hidden;
  color: var(--ds-color-on-surface);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.6);
  white-space: nowrap;
  pointer-events: none;
}
</style>
