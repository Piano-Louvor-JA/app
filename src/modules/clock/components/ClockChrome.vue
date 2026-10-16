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
import { useClockStore } from '../stores/useClockStore'
import ClockPreview from './ClockPreview.vue'
import ClockProjectFab from './ClockProjectFab.vue'

const CLOCK_ROUTE = 'utilities-clock'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useClockStore()

const stage = ref<StageSettings>(readEffectiveStageSettings('clock'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('clock')
  })
})
onUnmounted(() => unsubStage?.())

const effectiveConfig = computed(() => ({ ...store.config, ...stage.value.clock }))

const onClockRoute = computed(() => route.name === CLOCK_ROUTE)

/** No Relógio fica sempre à mão; nas outras telas só enquanto projeta. */
const visible = computed(() => onClockRoute.value || store.isProjecting)

/** Miniatura reflete a personalização do escopo clock (bg/caixa/cores). */
const previewStyle = computed(() => {
  const bg = resolveBackgroundImage(stage.value.backgroundImage)
  return {
    // Sem cor escolhida o preview é o próprio palco: preto, não um véu transparente.
    backgroundColor: stage.value.backgroundColor ?? '#000000',
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const chromeRoot = ref<HTMLElement | null>(null)
const { positionStyle, dragging, onPointerDown, resetPosition } =
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.clockChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.clock,
  })

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjection()
}

async function onOpenClock() {
  await router.push({ name: CLOCK_ROUTE })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="clock-chrome"
    :class="{ 'clock-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('clock.title')" />

    <aside
      class="clock-chrome__preview"
      :style="previewStyle"
      :title="t('clock.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <ClockPreview
        :config="effectiveConfig"
        :stage="stage"
      />
    </aside>

    <div class="clock-chrome__actions">
      <button
        v-if="!onClockRoute"
        type="button"
        class="clock-chrome__icon-btn"
        :aria-label="t('clock.openClock')"
        :title="t('clock.openClock')"
        @click="onOpenClock"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <ClockProjectFab
        :projecting="store.isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.clock-chrome {
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

.clock-chrome__preview {
  position: relative;
  width: 16rem;
  aspect-ratio: 16 / 9;
  box-sizing: border-box;
  display: flex;
  padding: 0.75rem;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: #000;
  border: 1px solid rgb(255 255 255 / 0.2);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  overflow: hidden;
  pointer-events: auto;
  cursor: grab;
}

.clock-chrome--dragging,
.clock-chrome--dragging .clock-chrome__preview {
  cursor: grabbing;
}

.clock-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.clock-chrome__icon-btn {
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }
}
</style>
