<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  disabled?: boolean
  projecting?: boolean
}>()

const emit = defineEmits<{
  project: []
  clear: []
}>()

const { t } = useI18n()

function onClick(projecting: boolean) {
  // O DOM bloqueia via :disabled quando parado sem seleção; durante projeção
  // o botão fica clicável (para poder parar) mesmo sem seleção ativa.
  if (projecting) emit('clear')
  else emit('project')
}
</script>

<template>
  <div class="bible-project-fab">
    <button
      type="button"
      class="bible-project-fab__btn"
      :class="{ 'bible-project-fab__btn--active': projecting }"
      :disabled="disabled && !projecting"
      :aria-label="projecting ? t('bible.clearProjection') : t('bible.project')"
      :title="projecting ? t('bible.clearProjection') : t('bible.project')"
      @click="onClick(Boolean(projecting))"
    >
      <i
        class="ti"
        :class="projecting ? 'ti-player-stop' : 'ti-player-play'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped lang="scss">
.bible-project-fab {
  position: fixed;
  right: 2rem;
  bottom: calc(var(--ds-dock-height, 5.5rem) + 1.25rem);
  z-index: 35;
  /* Coluna vertical: play em cima, TV embaixo — não invade o
     StagePaletteButton (que fica à direita com offset próprio). */
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
}

.bible-project-fab__btn {
  width: 4rem;
  height: 4rem;
  border: 4px solid color-mix(in srgb, #fff 20%, transparent);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  box-shadow: 0 8px 30px color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
  cursor: pointer;
  transition:
    transform 160ms ease,
    opacity 160ms ease,
    background-color 160ms ease;

  .ti {
    font-size: 2rem;
    line-height: 1;
  }

  &--active {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 90%, transparent);
    color: #1a1a1a;
    box-shadow: 0 8px 30px color-mix(in srgb, var(--ds-color-error, #ffb4ab) 40%, transparent);
  }

  &:hover:not(:disabled) {
    transform: scale(1.08);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
