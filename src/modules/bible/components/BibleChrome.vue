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

import { readEffectiveStageSettings } from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage } from '../../settings/types/stage-settings'
import { bibleProjectionSnippet, hasBibleProjection } from '../services/bible-preview'
import { useBibleStore } from '../stores/useBibleStore'
import BibleProjectFab from './BibleProjectFab.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectionMinimized = useInAppProjectionMinimized('bible')
const store = useBibleStore()

const hasProjection = computed(() => hasBibleProjection(store.projection))
const snippet = computed(() => bibleProjectionSnippet(store.projection.text))
const canNavigate = computed(() => store.selectedVerses.length > 0)

const onBibleRoute = computed(() => route.meta.navKey === 'bible')

/** Na Bíblia fica sempre à mão; nas outras telas só enquanto a Bíblia está no ar. */
const visible = computed(
  () => onBibleRoute.value || store.isProjecting || isIndependentProjectionActive('bible'),
)

/** Miniatura reflete a personalização do escopo bible (bg/caixa/cores). */
const previewStyle = computed(() => {
  const st = readEffectiveStageSettings('bible')
  const bg = resolveBackgroundImage(st.backgroundImage)
  return {
    // Sem cor escolhida o preview é o próprio palco: preto, não um véu transparente.
    backgroundColor: st.backgroundColor ?? '#000000',
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const chromeRoot = ref<HTMLElement | null>(null)
const { positionStyle, dragging, onPointerDown, resetPosition } =
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.bibleChromePosition, {
    stackOrder: FLOATING_STACK_ORDER.bible,
  })

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjectionWindow()
}

function onAdjacentVerse(direction: -1 | 1) {
  void store.goToAdjacentVerse(direction)
}

async function onOpenReader() {
  if (projectionMinimized.value) {
    projectionMinimized.value = false
    return
  }
  await router.push({ name: 'bible' })
}
</script>

<template>
  <div
    v-if="visible"
    ref="chromeRoot"
    class="bible-chrome"
    :class="{ 'bible-chrome--dragging': dragging }"
    :style="positionStyle"
    @pointerdown="onPointerDown"
  >
    <FloatingPreviewTitle :label="t('bible.title')" />

    <aside
      class="bible-chrome__preview"
      :style="previewStyle"
      :title="t('bible.chromeDragHint')"
      aria-live="polite"
      @dblclick="resetPosition"
    >
      <template v-if="hasProjection">
        <p class="bible-chrome__preview-text">
          “{{ snippet }}”
        </p>
        <p class="bible-chrome__preview-ref">
          {{ store.projection.scripturalReference }}
        </p>
        <!-- dblclick.stop: cliques rápidos nas setas não podem devolver o painel ao canto -->
        <button
          type="button"
          class="bible-chrome__verse-btn bible-chrome__verse-btn--prev"
          :disabled="!canNavigate"
          :aria-label="t('bible.previousVerse')"
          :title="t('bible.previousVerse')"
          @click="onAdjacentVerse(-1)"
          @dblclick.stop
        >
          <i
            class="ti ti-chevron-left"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="bible-chrome__verse-btn bible-chrome__verse-btn--next"
          :disabled="!canNavigate"
          :aria-label="t('bible.nextVerse')"
          :title="t('bible.nextVerse')"
          @click="onAdjacentVerse(1)"
          @dblclick.stop
        >
          <i
            class="ti ti-chevron-right"
            aria-hidden="true"
          />
        </button>
      </template>
      <p
        v-else
        class="bible-chrome__preview-empty"
      >
        {{ t('bible.noSelection') }}
      </p>
    </aside>

    <div class="bible-chrome__actions">
      <button
        v-if="projectionMinimized || !onBibleRoute"
        type="button"
        class="bible-chrome__icon-btn"
        :aria-label="projectionMinimized ? t('projection.restoreProjection') : t('bible.openReader')"
        :title="projectionMinimized ? t('projection.restoreProjection') : t('bible.openReader')"
        @click="onOpenReader"
      >
        <i
          class="ti ti-arrows-maximize"
          aria-hidden="true"
        />
      </button>

      <IndependentProjectionButton
        module-id="bible"
        :before-project="store.prepareIndependentProjection"
      />

      <BibleProjectFab
        :disabled="!hasProjection"
        :projecting="store.isProjecting"
        @project="onProject"
        @clear="onClear"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.bible-chrome {
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

.bible-chrome__preview {
  position: relative;
  width: 16rem;
  aspect-ratio: 16 / 9;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 2.25rem;
  text-align: center;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: #000;
  border: 1px solid rgb(255 255 255 / 0.2);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  pointer-events: auto;
  cursor: grab;
}

.bible-chrome--dragging,
.bible-chrome--dragging .bible-chrome__preview {
  cursor: grabbing;
}

.bible-chrome__preview-text {
  margin: 0;
  color: #fff;
  font-size: 0.7rem;
  line-height: 1.45;
}

.bible-chrome__preview-ref {
  margin: 0;
  color: #fb8c00;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.bible-chrome__preview-empty {
  margin: 0;
  color: rgb(255 255 255 / 0.6);
  font-size: 0.7rem;
  line-height: 1.45;
}

.bible-chrome__verse-btn {
  position: absolute;
  top: 50%;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 0.25);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1rem;
    line-height: 1;
  }

  &--prev {
    left: 0.35rem;
  }

  &--next {
    right: 0.35rem;
  }

  &:hover:not(:disabled) {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.bible-chrome__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.bible-chrome__icon-btn {
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
