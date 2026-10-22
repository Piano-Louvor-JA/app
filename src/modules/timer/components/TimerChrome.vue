<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
import FloatingPreviewTitle from '@shared/components/FloatingPreviewTitle.vue'
import { FLOATING_STACK_ORDER, useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, type StageSettings } from '../../settings/types/stage-settings'
import { useTimerStore } from '../stores/useTimerStore'
import TimerPreview from './TimerPreview.vue'
import TimerProjectFab from './TimerProjectFab.vue'

const TIMER_ROUTE = 'utilities-timer'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectionMinimized = useInAppProjectionMinimized('timer')
const store = useTimerStore()

const stage = ref<StageSettings>(readEffectiveStageSettings('timer'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('timer')
  })
})
onUnmounted(() => unsubStage?.())

const effectiveConfig = computed(() => ({ ...store.config, ...stage.value.timer }))

const onTimerRoute = computed(() => route.name === TIMER_ROUTE)

/** No Cronômetro fica sempre à mão; nas outras telas enquanto projeta ou roda. */
const visible = computed(
  () => onTimerRoute.value || store.isProjecting || store.isRunning,
)

/** Miniatura reflete a personalização do escopo timer (bg/caixa/cores). */
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
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.timerChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.timer,
  })

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjection()
}

async function onOpenStopwatch() {
  if (projectionMinimized.value) {
    projectionMinimized.value = false
    return
  }
  await router.push({ name: TIMER_ROUTE })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="timer-chrome"
    :class="{ 'timer-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('timer.title')" />

    <aside
      class="timer-chrome__preview"
      :style="previewStyle"
      :title="t('timer.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <TimerPreview
        :config="effectiveConfig"
        :runtime="store.runtime"
        :stage="stage"
      />
    </aside>

    <div class="timer-chrome__actions">
      <button
        v-if="projectionMinimized || !onTimerRoute"
        type="button"
        class="timer-chrome__icon-btn"
        :aria-label="projectionMinimized ? t('projection.restoreProjection') : t('timer.openStopwatch')"
        :title="projectionMinimized ? t('projection.restoreProjection') : t('timer.openStopwatch')"
        @click="onOpenStopwatch"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <button
        v-if="!store.isRunning"
        type="button"
        class="timer-chrome__toggle timer-chrome__toggle--start"
        :aria-label="t('timer.start')"
        :title="t('timer.start')"
        @click="store.start()"
      >
        <i
          class="ti ti-player-play"
          aria-hidden="true"
        />
      </button>
      <button
        v-else
        type="button"
        class="timer-chrome__toggle timer-chrome__toggle--pause"
        :aria-label="t('timer.pause')"
        :title="t('timer.pause')"
        @click="store.pause()"
      >
        <i
          class="ti ti-player-pause"
          aria-hidden="true"
        />
      </button>

      <TimerProjectFab
        :projecting="store.isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.timer-chrome {
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

.timer-chrome__preview {
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

.timer-chrome--dragging,
.timer-chrome--dragging .timer-chrome__preview {
  cursor: grabbing;
}

.timer-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.timer-chrome__icon-btn,
.timer-chrome__toggle {
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
    background-color 160ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover {
    transform: scale(1.06);
  }
}

.timer-chrome__icon-btn {
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }
}

.timer-chrome__toggle--start {
  background: rgb(46 125 50 / 0.85);
  color: #e8f5e9;
}

.timer-chrome__toggle--pause {
  background: rgb(239 108 0 / 0.85);
  color: #fff3e0;
}
</style>
