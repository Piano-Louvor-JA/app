<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import FloatingPreviewTitle from '@shared/components/FloatingPreviewTitle.vue'
import { FLOATING_STACK_ORDER, useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, type StageSettings } from '../../settings/types/stage-settings'
import { useRandomStore } from '../stores/useRandomStore'
import RandomProjectFab from './RandomProjectFab.vue'

const RANDOM_ROUTE = 'utilities-random'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useRandomStore()

const stage = ref<StageSettings>(readEffectiveStageSettings('random'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('random')
  })
})
onUnmounted(() => unsubStage?.())

// Personalização do diálogo do sorteio tem prioridade sobre o sub-bloco do Palco.
const effectiveConfig = computed(() => ({ ...stage.value.random, ...store.config }))

const onRandomRoute = computed(() => route.name === RANDOM_ROUTE)

/** No Sorteio fica sempre à mão; nas outras telas enquanto projeta ou sorteia. */
const visible = computed(
  () => onRandomRoute.value || store.isProjecting || store.runtime.isDrawing,
)

/** Mesmo fundo da projeção: imagem do Palco ou a cor do diálogo do sorteio. */
const previewStyle = computed(() => {
  const bg = resolveBackgroundImage(stage.value.backgroundImage)
  return {
    backgroundColor: bg ? (stage.value.backgroundColor ?? '#000000') : effectiveConfig.value.bgColor,
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const displayText = computed(
  () => store.runtime.currentDisplay || t('random.placeholderDisplay'),
)

const displayStyle = computed(() => ({
  color: effectiveConfig.value.textColor,
  textTransform: effectiveConfig.value.textTransform,
  opacity: store.runtime.currentDisplay ? 1 : 0.55,
}))

const chromeRoot = ref<HTMLElement | null>(null)
const { positionStyle, dragging, onPointerDown, resetPosition } =
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.randomChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.random,
  })

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjection()
}

async function onOpenRandom() {
  await router.push({ name: RANDOM_ROUTE })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="random-chrome"
    :class="{ 'random-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('random.title')" />

    <aside
      class="random-chrome__preview"
      :style="previewStyle"
      :title="t('random.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <span
        class="random-chrome__display"
        :class="{
          'random-chrome__display--names': store.runtime.mode !== 'numbers',
          'random-chrome__display--drawing': store.runtime.isDrawing,
        }"
        :style="displayStyle"
      >
        {{ displayText }}
      </span>
    </aside>

    <div class="random-chrome__actions">
      <template v-if="!onRandomRoute">
        <button
          type="button"
          class="random-chrome__icon-btn"
          :aria-label="t('random.openRandom')"
          :title="t('random.openRandom')"
          @click="onOpenRandom"
        >
          <i
            class="ti ti-arrows-maximize"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="random-chrome__draw"
          :disabled="!store.canDraw"
          :aria-label="t('random.drawButton')"
          :title="t('random.drawButton')"
          @click="store.startDraw()"
        >
          <i
            class="ti ti-dice-5"
            aria-hidden="true"
          />
        </button>
      </template>

      <RandomProjectFab
        :projecting="store.isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.random-chrome {
  position: fixed;
  right: 2rem;
  bottom: calc(var(--ds-dock-height, 5.5rem) + 1.25rem);
  z-index: 35;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  pointer-events: none;
  user-select: none;
  touch-action: none;
}

.random-chrome__preview {
  position: relative;
  width: 16rem;
  aspect-ratio: 16 / 9;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: #000;
  border: 1px solid rgb(255 255 255 / 0.2);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  overflow: hidden;
  container-type: size;
  pointer-events: auto;
  cursor: grab;
}

.random-chrome__display {
  max-width: 100%;
  font-size: 32cqh;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;

  &--names {
    font-size: 16cqh;
  }

  &--drawing {
    color: var(--ds-color-on-surface-variant) !important;
  }
}

.random-chrome--dragging,
.random-chrome--dragging .random-chrome__preview {
  cursor: grabbing;
}

.random-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.random-chrome__icon-btn,
.random-chrome__draw {
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.random-chrome__icon-btn {
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }
}

.random-chrome__draw {
  background: rgb(46 125 50 / 0.85);
  color: #e8f5e9;
}
</style>
