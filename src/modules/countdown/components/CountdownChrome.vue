<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
import FloatingPreviewTitle from '@shared/components/FloatingPreviewTitle.vue'
import IndependentProjectionButton from '@shared/components/IndependentProjectionButton.vue'
import { isIndependentProjectionActive } from '@shared/composables/useIndependentProjection'
import { FLOATING_STACK_ORDER, useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import { resolveBackgroundImage } from '../../settings/types/stage-settings'
import { useCountdownStage } from '../composables/useCountdownStage'
import { sabbathIdlePreviewRuntime } from '../services/countdown-sabbath-preview'
import { useCountdownStore } from '../stores/useCountdownStore'
import CountdownPreview from './CountdownPreview.vue'
import CountdownProjectFab from './CountdownProjectFab.vue'

const COUNTDOWN_ROUTE = 'utilities-countdown'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectionMinimized = useInAppProjectionMinimized('countdown')
const store = useCountdownStore()

const { stage, effectiveConfig } = useCountdownStage(() => store.config)

const onCountdownRoute = computed(() => route.name === COUNTDOWN_ROUTE)

/**
 * No Timer fica sempre à mão; nas outras telas enquanto projeta ou roda —
 * rodando sem projeção, esta prévia é o que mantém os alertas tocando.
 */
const visible = computed(
  () => onCountdownRoute.value || store.isProjecting || store.isRunning || isIndependentProjectionActive('countdown'),
)


const previewRuntime = computed(
  () => sabbathIdlePreviewRuntime(effectiveConfig.value, store.runtime) ?? store.runtime,
)

/** Miniatura reflete a personalização do escopo countdown (bg/caixa/cores). */
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
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.countdownChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.countdown,
  })

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjection()
}

async function onOpenTimer() {
  if (projectionMinimized.value) {
    projectionMinimized.value = false
    return
  }
  await router.push({ name: COUNTDOWN_ROUTE })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="countdown-chrome"
    :class="{ 'countdown-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('countdown.title')" />

    <aside
      class="countdown-chrome__preview"
      :style="previewStyle"
      :title="t('countdown.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <CountdownPreview
        :config="effectiveConfig"
        :runtime="previewRuntime"
        :stage="stage"
      />
    </aside>

    <div class="countdown-chrome__actions">
      <button
        v-if="projectionMinimized || !onCountdownRoute"
        type="button"
        class="countdown-chrome__icon-btn"
        :aria-label="projectionMinimized ? t('projection.restoreProjection') : t('countdown.openTimer')"
        :title="projectionMinimized ? t('projection.restoreProjection') : t('countdown.openTimer')"
        @click="onOpenTimer"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <button
        v-if="!store.isRunning"
        type="button"
        class="countdown-chrome__toggle countdown-chrome__toggle--start"
        :disabled="!store.canStart"
        :aria-label="t('countdown.start')"
        :title="t('countdown.start')"
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
        class="countdown-chrome__toggle countdown-chrome__toggle--pause"
        :aria-label="t('countdown.pause')"
        :title="t('countdown.pause')"
        @click="store.pause()"
      >
        <i
          class="ti ti-player-pause"
          aria-hidden="true"
        />
      </button>

      <IndependentProjectionButton
        module-id="countdown"
      />

      <CountdownProjectFab
        :projecting="store.isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.countdown-chrome {
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

.countdown-chrome__preview {
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

.countdown-chrome--dragging,
.countdown-chrome--dragging .countdown-chrome__preview {
  cursor: grabbing;
}

.countdown-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.countdown-chrome__icon-btn,
.countdown-chrome__toggle {
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

.countdown-chrome__icon-btn {
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }
}

.countdown-chrome__toggle--start {
  background: rgb(46 125 50 / 0.85);
  color: #e8f5e9;
}

.countdown-chrome__toggle--pause {
  background: rgb(239 108 0 / 0.85);
  color: #fff3e0;
}
</style>
