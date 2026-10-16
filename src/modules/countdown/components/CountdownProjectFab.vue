<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  projecting: boolean
}>()

const emit = defineEmits<{
  project: []
  clear: []
}>()

const { t } = useI18n()

function onClick(projecting: boolean) {
  if (projecting) emit('clear')
  else emit('project')
}
</script>

<template>
  <button
    type="button"
    class="countdown-project-fab"
    :class="{ 'countdown-project-fab--active': projecting }"
    :aria-label="projecting ? t('countdown.clearProjection') : t('countdown.project')"
    :title="projecting ? t('countdown.clearProjection') : t('countdown.project')"
    @click="onClick(projecting)"
  >
    <i
      class="ti"
      :class="projecting ? 'ti-player-stop' : 'ti-presentation'"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped lang="scss">
.countdown-project-fab {
  flex-shrink: 0;
  pointer-events: auto;
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

  &:hover {
    transform: scale(1.08);
  }

  &:active {
    transform: scale(0.95);
  }
}

@media (max-width: 1280px) {
  .countdown-project-fab {
    width: 3.25rem;
    height: 3.25rem;
    border-width: 3px;

    .ti {
      font-size: 1.65rem;
    }
  }
}
</style>
