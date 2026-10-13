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

function onClick(projecting: boolean, disabled: boolean) {
  if (disabled && !projecting) return
  if (projecting) emit('clear')
  else emit('project')
}
</script>

<template>
  <button
    type="button"
    class="media-project-fab"
    :class="{ 'media-project-fab--active': projecting }"
    :disabled="disabled && !projecting"
    :aria-label="projecting ? t('media.clearProjection') : t('media.project')"
    :title="projecting ? t('media.clearProjection') : t('media.project')"
    @click="onClick(Boolean(projecting), Boolean(disabled))"
  >
    <i
      class="ti"
      :class="projecting ? 'ti-player-stop' : 'ti-player-play'"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped lang="scss">
.media-project-fab {
  position: relative;
  z-index: 35;
  width: 4rem;
  height: 4rem;
  flex-shrink: 0;
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

@media (max-width: 1280px) {
  .media-project-fab {
    width: 3.25rem;
    height: 3.25rem;
    border-width: 3px;

    .ti {
      font-size: 1.65rem;
    }
  }
}
</style>
