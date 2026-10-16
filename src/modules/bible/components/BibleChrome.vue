<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useFloatingDrag } from '@shared/composables/useFloatingDrag'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

import { readEffectiveStageSettings } from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage } from '../../settings/types/stage-settings'
import { bibleProjectionSnippet, hasBibleProjection } from '../services/bible-preview'
import { useBibleStore } from '../stores/useBibleStore'
import BibleProjectFab from './BibleProjectFab.vue'

const { t } = useI18n()
const route = useRoute()
const store = useBibleStore()

const hasProjection = computed(() => hasBibleProjection(store.projection))
const snippet = computed(() => bibleProjectionSnippet(store.projection.text))

/** Na Bíblia fica sempre à mão; nas outras telas só enquanto a Bíblia está no ar. */
const visible = computed(
  () => route.meta.navKey === 'bible' || store.isProjecting,
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
  useFloatingDrag(chromeRoot, USER_PREFERENCE_KEYS.bibleChromePosition)

function onProject() {
  void store.toggleProjection()
}

function onClear() {
  store.clearProjectionWindow()
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
      </template>
      <p
        v-else
        class="bible-chrome__preview-empty"
      >
        {{ t('bible.noSelection') }}
      </p>
    </aside>

    <BibleProjectFab
      :disabled="!hasProjection"
      :projecting="store.isProjecting"
      @project="onProject"
      @clear="onClear"
    />
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
  width: 16rem;
  aspect-ratio: 16 / 9;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
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
</style>
