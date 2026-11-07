<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CountdownPreview from '@modules/countdown/components/CountdownPreview.vue'
import CountdownProjectFab from '@modules/countdown/components/CountdownProjectFab.vue'
import { useCountdownStage } from '@modules/countdown/composables/useCountdownStage'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import { resolveBackgroundImage } from '@modules/settings/types/stage-settings'
import FloatingPreviewTitle from '@shared/components/FloatingPreviewTitle.vue'
import MiniPlayerCloseButton from '@shared/components/MiniPlayerCloseButton.vue'
import { FLOATING_STACK_ORDER, useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import { SABBATH_SCHOOL_ROUTE, useSabbathSchoolStore } from '../stores/useSabbathSchoolStore'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectionMinimized = useInAppProjectionMinimized('countdown')
const store = useSabbathSchoolStore()
// só a aparência da tela de contagem (cores e formato) vem do Timer
const appearance = useCountdownStore()

const { stage, effectiveConfig } = useCountdownStage(() => appearance.config)

const onRoute = computed(() => route.name === SABBATH_SCHOOL_ROUTE)

const dismissed = ref(false)
watch(() => route.name, () => { dismissed.value = false })
watch(() => store.isProjecting, (active) => { if (active) dismissed.value = false })
watch(() => store.isRunning, (running) => { if (running) dismissed.value = false })

const visible = computed(
  () => !dismissed.value && (onRoute.value || store.isProjecting || !store.isIdle),
)

const previewStyle = computed(() => {
  const bg = resolveBackgroundImage(stage.value.backgroundImage)
  return {
    backgroundColor: stage.value.backgroundColor ?? '#000000',
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const chromeRoot = ref<HTMLElement | null>(null)
const { positionStyle, dragging, onPointerDown, resetPosition } =
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.sabbathSchoolChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.sabbathSchool,
  })

function onClose() {
  store.pause()
  store.stopAudio()
  if (store.isProjecting) store.clearProjection()
  projectionMinimized.value = false
  dismissed.value = true
}

async function onOpen() {
  if (projectionMinimized.value && store.inAppPreview) {
    projectionMinimized.value = false
    return
  }
  await router.push({ name: SABBATH_SCHOOL_ROUTE })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="sabbath-chrome"
    :class="{ 'sabbath-chrome--dragging': dragging }"
    :style="positionStyle"
    data-testid="sabbath-chrome"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('sabbathSchool.title')" />

    <aside
      class="sabbath-chrome__preview"
      :style="previewStyle"
      :title="t('sabbathSchool.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <MiniPlayerCloseButton
        v-if="!onRoute"
        :label="t('sabbathSchool.title')"
        @close="onClose"
      />
      <CountdownPreview
        :config="effectiveConfig"
        :runtime="store.runtime"
        :stage="stage"
        muted
      />
    </aside>

    <div class="sabbath-chrome__actions">
      <button
        v-if="!onRoute || (projectionMinimized && store.inAppPreview)"
        type="button"
        class="sabbath-chrome__icon-btn"
        data-testid="sabbath-chrome-open"
        :aria-label="t('sabbathSchool.openSabbathSchool')"
        :title="t('sabbathSchool.openSabbathSchool')"
        @click="onOpen"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <button
        v-if="!store.isRunning"
        type="button"
        class="sabbath-chrome__toggle sabbath-chrome__toggle--start"
        data-testid="sabbath-chrome-start"
        :disabled="!store.canStart() && !store.rehearsing"
        :aria-label="t('sabbathSchool.start')"
        :title="t('sabbathSchool.start')"
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
        class="sabbath-chrome__toggle sabbath-chrome__toggle--pause"
        data-testid="sabbath-chrome-pause"
        :aria-label="t('sabbathSchool.pause')"
        :title="t('sabbathSchool.pause')"
        @click="store.pause()"
      >
        <i
          class="ti ti-player-pause"
          aria-hidden="true"
        />
      </button>

      <CountdownProjectFab
        :projecting="store.isProjecting"
        @project="store.toggleProjection()"
        @clear="store.clearProjection()"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.sabbath-chrome {
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

.sabbath-chrome__preview {
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
  overflow: visible;
  pointer-events: auto;
  cursor: grab;
}

.sabbath-chrome--dragging,
.sabbath-chrome--dragging .sabbath-chrome__preview {
  cursor: grabbing;
}

.sabbath-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.sabbath-chrome__icon-btn,
.sabbath-chrome__toggle {
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

.sabbath-chrome__icon-btn {
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }
}

.sabbath-chrome__toggle--start {
  background: rgb(46 125 50 / 0.85);
  color: #e8f5e9;
}

.sabbath-chrome__toggle--pause {
  background: rgb(239 108 0 / 0.85);
  color: #fff3e0;
}
</style>
