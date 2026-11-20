<script setup lang="ts">
import { ref, watch } from 'vue'

import type { MinimizedBarItem } from '@design-system/types/navigation'

/**
 * Barra de páginas minimizadas (entre a faixa de histórico e o dock).
 * Só apresentação: quem decide abrir/fechar é o AppShell.
 * Mouse em cima ou foco no item mostram a prévia e o x.
 * Usa a largura toda; o que não couber rola para os lados.
 * O item da página aberta agora (`currentKey`) fica em destaque.
 */
const props = defineProps<{
  items: MinimizedBarItem[]
  navLabel: string
  currentKey?: string | null
}>()

const emit = defineEmits<{
  open: [key: string]
  close: [key: string]
  /** Arrastar (ou Alt+setas) levou o item para a posição `toIndex`. */
  reorder: [key: string, toIndex: number]
}>()

/** Largura da prévia (CSS) e folga mínima até a borda da janela. */
const PREVIEW_HALF_WIDTH = 120
const PREVIEW_EDGE = 8
const PREVIEW_GAP = 10

const listEl = ref<HTMLUListElement | null>(null)

/** Item com a prévia aberta (mouse ou foco). */
const activeKey = ref<string | null>(null)
/** Ponto da prévia na janela: fora da lista rolável, para não ser cortada. */
const previewAnchor = ref({ left: 0, top: 0 })

function show(key: string, event: Event) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const min = PREVIEW_HALF_WIDTH + PREVIEW_EDGE
  const max = window.innerWidth - PREVIEW_HALF_WIDTH - PREVIEW_EDGE
  previewAnchor.value = {
    left: Math.min(Math.max(rect.left + rect.width / 2, min), max),
    top: rect.top - PREVIEW_GAP,
  }
  activeKey.value = key
}

function hide(key: string) {
  if (activeKey.value === key) activeKey.value = null
}

function onFocusOut(key: string, event: FocusEvent) {
  const slot = event.currentTarget as HTMLElement
  // foco indo para o x (dentro do mesmo item) mantém a prévia
  if (event.relatedTarget instanceof Node && slot.contains(event.relatedTarget)) return
  hide(key)
}

function onItemKeydown(key: string, index: number, event: KeyboardEvent) {
  if (event.key === 'Delete') emit('close', key)
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
  event.preventDefault()
  const toIndex = index + (event.key === 'ArrowLeft' ? -1 : 1)
  if (toIndex >= 0 && toIndex < props.items.length) emit('reorder', key, toIndex)
}

/** Item sendo arrastado e onde ele cai (antes/depois de qual item). */
const draggingKey = ref<string | null>(null)
const dropTarget = ref<{ key: string; side: 'before' | 'after' } | null>(null)

function onDragStart(key: string, event: DragEvent) {
  draggingKey.value = key
  activeKey.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
}

function onDragOver(key: string, event: DragEvent) {
  if (!draggingKey.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  if (key === draggingKey.value) {
    dropTarget.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropTarget.value = { key, side: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' }
}

function onDrop() {
  const key = draggingKey.value
  const target = dropTarget.value
  clearDrag()
  if (!key || !target) return
  const from = props.items.findIndex((item) => item.key === key)
  let toIndex = props.items.findIndex((item) => item.key === target.key) + (target.side === 'after' ? 1 : 0)
  if (from < toIndex) toIndex -= 1
  if (toIndex !== from) emit('reorder', key, toIndex)
}

function clearDrag() {
  draggingKey.value = null
  dropTarget.value = null
}

/** Rodinha vertical rola a barra para os lados quando ela não cabe. */
function onWheel(event: WheelEvent) {
  const list = event.currentTarget as HTMLElement
  if (list.scrollWidth <= list.clientWidth) return
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
  event.preventDefault()
  list.scrollLeft += event.deltaY
}

watch(
  () => props.items.length,
  (count, previous) => {
    if (count > previous) listEl.value!.scrollLeft = listEl.value!.scrollWidth
  },
  { flush: 'post' },
)
</script>

<template>
  <nav class="ds-minimized-bar" :aria-label="navLabel">
    <ul
      ref="listEl"
      class="ds-minimized-bar__list"
      @wheel="onWheel"
      @scroll.passive="activeKey = null"
    >
      <li
        v-for="(item, index) in items"
        :key="item.key"
        class="ds-minimized-bar__slot"
        :class="{
          'ds-minimized-bar__slot--dragging': draggingKey === item.key,
          'ds-minimized-bar__slot--drop-before': dropTarget?.key === item.key && dropTarget.side === 'before',
          'ds-minimized-bar__slot--drop-after': dropTarget?.key === item.key && dropTarget.side === 'after',
        }"
        draggable="true"
        @dragstart="onDragStart(item.key, $event)"
        @dragover="onDragOver(item.key, $event)"
        @drop.prevent="onDrop"
        @dragend="clearDrag"
        @mouseenter="show(item.key, $event)"
        @mouseleave="hide(item.key)"
        @focusin="show(item.key, $event)"
        @focusout="onFocusOut(item.key, $event)"
      >
        <button
          type="button"
          class="ds-minimized-bar__item"
          :class="{ 'ds-minimized-bar__item--current': item.key === currentKey }"
          :aria-current="item.key === currentKey ? 'page' : undefined"
          :data-minimized-key="item.key"
          :aria-label="item.title"
          @click="emit('open', item.key)"
          @keydown="onItemKeydown(item.key, index, $event)"
        >
          <i class="ti" :class="item.icon" aria-hidden="true" />
          <span class="ds-minimized-bar__title">{{ item.title }}</span>
        </button>

        <button
          v-if="activeKey === item.key"
          type="button"
          class="ds-minimized-bar__close"
          :aria-label="item.closeLabel"
          :title="item.closeLabel"
          @click.stop="emit('close', item.key)"
        >
          <i class="ti ti-x" aria-hidden="true" />
        </button>

        <div
          v-if="activeKey === item.key"
          class="ds-minimized-bar__preview"
          role="tooltip"
          :style="{ left: `${previewAnchor.left}px`, top: `${previewAnchor.top}px` }"
        >
          <img
            v-if="item.preview"
            class="ds-minimized-bar__preview-image"
            :src="item.preview"
            alt=""
          >
          <div v-else class="ds-minimized-bar__preview-icon">
            <i class="ti" :class="item.icon" aria-hidden="true" />
          </div>
          <strong class="ds-minimized-bar__preview-title">{{ item.title }}</strong>
          <span v-if="item.summary" class="ds-minimized-bar__preview-summary">{{ item.summary }}</span>
        </div>
      </li>
    </ul>
  </nav>
</template>

<style scoped lang="scss">
.ds-minimized-bar {
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  width: 100%;
  height: var(--ds-minimized-bar-height, 40px);
  padding: 0 0.5rem;
}

/* Cabendo: centralizada. Não cabendo: ocupa a largura toda e rola para os lados. */
.ds-minimized-bar__list {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  margin: 0;
  /* folga para o x, que fica 4px acima/à direita do item */
  padding: 4px 6px 0;
  overflow-x: auto;
  overflow-y: hidden;
  list-style: none;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.ds-minimized-bar__slot {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;

  &--dragging {
    opacity: 0.45;
  }

  /* linha de onde o item arrastado vai cair, no meio do espaço entre os itens */
  &--drop-before::before,
  &--drop-after::after {
    content: '';
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 999px;
    background: var(--ds-color-primary);
    box-shadow: 0 0 8px var(--ds-color-primary);
    pointer-events: none;
  }

  &--drop-before::before {
    left: calc(-0.25rem - 1.5px);
  }

  &--drop-after::after {
    right: calc(-0.25rem - 1.5px);
  }
}

.ds-minimized-bar__item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 13rem;
  height: 30px;
  padding: 0 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    border-color var(--ds-motion-duration, 280ms) ease;

  .ti {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--ds-color-primary);
  }

  &:hover {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, var(--ds-color-surface-card));
  }

  /* página aberta agora: maior e na cor de destaque */
  &--current,
  &--current:hover {
    max-width: 15rem;
    height: 32px;
    padding: 0 0.95rem;
    border-color: var(--ds-color-primary);
    background: var(--ds-color-primary);
    box-shadow: 0 0 14px color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    color: var(--ds-color-on-primary);
    font-size: 13px;
    font-weight: 700;

    .ti {
      font-size: 17px;
      color: var(--ds-color-on-primary);
    }
  }
}

.ds-minimized-bar__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-minimized-bar__close {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 12px;
  cursor: pointer;
}

/* left/top vêm do item (ver show); fixed para escapar do recorte da lista rolável */
.ds-minimized-bar__preview {
  position: fixed;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 240px;
  padding: 0.5rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.75rem;
  background: var(--ds-color-surface-card);
  box-shadow: 0 12px 32px color-mix(in srgb, #000 45%, transparent);
  transform: translate(-50%, -100%);
  pointer-events: none;
}

.ds-minimized-bar__preview-image {
  width: 100%;
  border-radius: 0.5rem;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: top;
}

.ds-minimized-bar__preview-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);
  font-size: 40px;
}

.ds-minimized-bar__preview-title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-minimized-bar__preview-summary {
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
}

.ds-minimized-bar__item:focus-visible,
.ds-minimized-bar__close:focus-visible {
  outline: 2px solid var(--ds-color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .ds-minimized-bar__item {
    transition: none;
  }
}
</style>
