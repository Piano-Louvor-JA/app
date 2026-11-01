<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import FloatingPreviewTitle from '@shared/components/FloatingPreviewTitle.vue'
import { FLOATING_STACK_ORDER, useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import { useMediaPlayer } from '../composables/useMediaPlayer'
import MediaProjectFab from './MediaProjectFab.vue'
import MediaStatusPreview from './MediaStatusPreview.vue'
import MediaCloseDialog from './MediaCloseDialog.vue'

const { t } = useI18n()
const router = useRouter()

const {
  hasSession,
  minimized,
  isProjecting,
  isPlaying,
  previewSnippet,
  previewReference,
  session,
  queueLabel,
  toggleProjection,
  stopProjection,
  togglePlay,
  maximize,
  close,
  requestClose,
  cancelClose,
  closeConfirmOpen,
} = useMediaPlayer()

const visible = computed(() => hasSession.value && minimized.value)

/** "Player · nome": a playlist tocando, ou a coletânea/hinário do hino. */
const chromeDetail = computed(() => queueLabel.value || session.value?.subtitle || undefined)

const chromeRoot = ref<HTMLElement | null>(null)
const { positionStyle, dragging, onPointerDown, resetPosition } =
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.mediaChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.media,
  })

async function onProject() {
  await toggleProjection()
}

function onClear() {
  stopProjection()
}

async function onExpand() {
  maximize()
  await router.push({ name: 'media' })
}

async function onToggleAudio() {
  await togglePlay()
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="media-chrome"
    :class="{ 'media-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle
      :label="t('media.title')"
      :detail="chromeDetail"
    />

    <div
      class="media-chrome__handle"
      :title="t('media.chromeDragHint')"
      @dblclick="resetPosition"
    >
      <button
        type="button"
        class="media-chrome__icon-btn media-chrome__close"
        :aria-label="t('media.close')"
        :title="t('media.close')"
        @click="requestClose"
      >
        <i class="ti ti-x" aria-hidden="true" />
      </button>
      <MediaStatusPreview
        :snippet="previewSnippet"
        :reference="previewReference"
      />
    </div>

    <div class="media-chrome__actions">
      <button
        type="button"
        class="media-chrome__icon-btn"
        :aria-label="isPlaying ? t('media.pause') : t('media.play')"
        :title="isPlaying ? t('media.pause') : t('media.play')"
        @click="onToggleAudio"
      >
        <i
          class="ti"
          :class="isPlaying ? 'ti-player-pause' : 'ti-player-play'"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="media-chrome__icon-btn"
        :aria-label="t('media.maximize')"
        :title="t('media.maximize')"
        @click="onExpand"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <MediaProjectFab
        :projecting="isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
  <Teleport to="body">
    <MediaCloseDialog
      v-if="visible && closeConfirmOpen"
      class="media-chrome-close-dialog"
      :open="closeConfirmOpen"
      @cancel="cancelClose"
      @confirm="close"
    />
  </Teleport>
</template>

<style scoped lang="scss">
.media-chrome-close-dialog {
  position: fixed;
  z-index: 112;
}

.media-chrome {
  position: fixed;
  right: 2rem;
  bottom: calc(var(--ds-dock-height, 5.5rem) + 1.25rem);
  z-index: 111;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  pointer-events: none;
  user-select: none;
  touch-action: none;
}

.media-chrome__handle {
  position: relative;
  pointer-events: auto;
  cursor: grab;
}

.media-chrome__icon-btn.media-chrome__close {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.35rem);
  width: 1.75rem;
  height: 1.75rem;
  border-color: #ff8a80;
  background: #c62828;
  color: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
  pointer-events: auto;

  &:hover {
    background: #e53935;
    border-color: #fff;
  }
}

.media-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.media-chrome--dragging,
.media-chrome--dragging .media-chrome__handle {
  position: relative;
  cursor: grabbing;
}

.media-chrome__icon-btn {
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
  transition: transform 160ms ease, background-color 160ms ease;

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
