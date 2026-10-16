<script setup lang="ts">
/**
 * Nome do recurso acima de uma prévia flutuante (Relógio, Timer, Bíblia…).
 * Posicionado em relação ao contêiner fixo da prévia: não muda o layout nem
 * o arrastar.
 */
defineProps<{
  label: string
  /** Segunda parte opcional, em branco (ex.: coletânea no "Player · …"). */
  detail?: string
}>()
</script>

<template>
  <span class="floating-preview-title">
    {{ label }}<template v-if="detail">
      <span class="floating-preview-title__separator" aria-hidden="true"> · </span>
      <span class="floating-preview-title__detail">{{ detail }}</span>
    </template>
  </span>
</template>

<style scoped lang="scss">
.floating-preview-title {
  position: absolute;
  bottom: calc(100% + 0.35rem);
  left: 0;
  max-width: 16rem;
  overflow: hidden;
  padding: 0.15rem 0.6rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  border-radius: 999px;
  /* fundo escuro meio transparente: separa do texto da tela por trás */
  background: rgb(0 0 0 / 0.6);
  backdrop-filter: blur(4px);
  color: var(--ds-color-primary);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

/* fundo da etiqueta é sempre escuro: branco fixo, independente do tema */
.floating-preview-title__detail {
  color: #fff;
}
</style>
