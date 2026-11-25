<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import LiturgyAppearancePanel from './LiturgyAppearancePanel.vue'

/**
 * Paleta da tela da Liturgia: personaliza a lista (categorias e cor de cada
 * tipo). O palco da liturgia (o que vai para as telas) abre por um atalho
 * dentro do painel.
 */

const { t } = useI18n()
const open = ref(false)
const stageOpen = ref(false)

function openStage() {
  open.value = false
  stageOpen.value = true
}
</script>

<template>
  <div>
    <button
      type="button"
      class="liturgy-appearance-fab"
      data-testid="liturgy-appearance-open"
      :aria-label="t('liturgy.appearance.button')"
      :title="t('liturgy.appearance.button')"
      @click="open = true"
    >
      <i
        class="ti ti-palette"
        aria-hidden="true"
      />
    </button>

    <StageCustomizationDialog
      :open="open"
      scope="liturgy"
      :title="t('liturgy.appearance.title')"
      @close="open = false"
    >
      <LiturgyAppearancePanel @open-stage="openStage" />
    </StageCustomizationDialog>

    <StageCustomizationDialog
      :open="stageOpen"
      scope="liturgy"
      @close="stageOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.liturgy-appearance-fab {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  .ti {
    font-size: 1.15rem;
  }
}
</style>
