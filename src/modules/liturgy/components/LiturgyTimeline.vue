<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { LiturgyItem } from '../types/liturgy'
import { getCategoryBlockEnd } from '../services/liturgy-item-helpers'
import LiturgyTimelineItem from './LiturgyTimelineItem.vue'

const props = defineProps<{
  items: LiturgyItem[]
  selectedIndex: number | null
  siteProjectionItemId?: string | null
  videoProjectionItemId?: string | null
  startLabels: string[]
  durationLabels: string[]
  canClone?: boolean
  deletionLocked?: boolean
  /** musicId → tem instrumental no catálogo. */
  musicInstrumentalById?: Record<number, boolean>
  busyMusicId?: number | null
}>()

const emit = defineEmits<{
  videoFileSelected: [itemId: string, durationSec: number]
  select: [index: number]
  playScreens: [index: number]
  edit: [index: number]
  remove: [index: number]
  toggleDone: [index: number]
  reorder: [fromIndex: number, toIndex: number]
  clone: []
  addSubItem: [categoryId: string]
  musicSung: [index: number]
  musicInstrumental: [index: number]
  musicSlides: [index: number]
  musicLyric: [index: number]
  setPlayer: [index: number, playerId: string]
}>()

function musicHasInstrumental(item: LiturgyItem): boolean {
  if (item.type !== 'music' || item.musicId == null) return false
  return Boolean(props.musicInstrumentalById?.[item.musicId])
}

function isMusicBusy(item: LiturgyItem): boolean {
  if (item.type !== 'music' || item.musicId == null) return false
  return props.busyMusicId === item.musicId
}

const { t } = useI18n()
const dragFrom = ref<number | null>(null)
/** IDs das categorias com filhos recolhidos. */
const collapsedCategoryIds = ref<Set<string>>(new Set())

type TimelineEntry = { item: LiturgyItem; index: number }

type TimelineSegment =
  | { kind: 'item'; entry: TimelineEntry; linked: boolean; childCount: number }
  | { kind: 'branch'; categoryId: string; children: TimelineEntry[] }

const segments = computed((): TimelineSegment[] => {
  const result: TimelineSegment[] = []
  let index = 0

  while (index < props.items.length) {
    const item = props.items[index]
    if (!item) break

    if (item.type === 'category') {
      const categoryIndex = index
      index += 1

      const children: TimelineEntry[] = []
      while (index < props.items.length) {
        const child = props.items[index]
        if (!child || child.type === 'category') break
        if (child.categoryId !== item.id) break
        children.push({ item: child, index })
        index += 1
      }

      result.push({
        kind: 'item',
        entry: { item, index: categoryIndex },
        linked: false,
        childCount: children.length,
      })

      if (children.length > 0) {
        result.push({
          kind: 'branch',
          categoryId: item.id,
          children,
        })
      }
      continue
    }

    result.push({
      kind: 'item',
      entry: { item, index },
      linked: Boolean(item.categoryId),
      childCount: 0,
    })
    index += 1
  }

  return result
})

function isCategoryCollapsed(categoryId: string): boolean {
  return collapsedCategoryIds.value.has(categoryId)
}

function toggleCategoryCollapse(categoryId: string) {
  const next = new Set(collapsedCategoryIds.value)
  if (next.has(categoryId)) next.delete(categoryId)
  else next.add(categoryId)
  collapsedCategoryIds.value = next
}

function onDragStart(itemIndex: number) {
  dragFrom.value = itemIndex
}

function onDragEnd() {
  dragFrom.value = null
}

function onDrop(toIndex: number) {
  if (dragFrom.value == null) return
  emit('reorder', dragFrom.value, toIndex)
  dragFrom.value = null
}

const dragBlockRange = computed(() => {
  if (dragFrom.value == null) return null
  const item = props.items[dragFrom.value]
  if (!item) return null
  if (item.type !== 'category') {
    return { start: dragFrom.value, end: dragFrom.value + 1 }
  }
  return {
    start: dragFrom.value,
    end: getCategoryBlockEnd(props.items, dragFrom.value),
  }
})

function isDragBlockIndex(index: number): boolean {
  const range = dragBlockRange.value
  if (!range) return false
  return index >= range.start && index < range.end
}

function isCategoryIndeterminate(categoryId: string): boolean {
  const children = props.items.filter(
    (item) => item.type !== 'category' && item.categoryId === categoryId,
  )
  if (children.length === 0) return false
  const doneCount = children.filter((item) => item.done).length
  return doneCount > 0 && doneCount < children.length
}

/** Todas as categorias acima desta já estão concluídas. */
function arePreviousCategoriesDone(categoryId: string): boolean {
  for (const item of props.items) {
    if (item.type !== 'category') continue
    if (item.id === categoryId) return true
    if (!item.done) return false
  }
  /* v8 ignore next 1 -- chamada só ocorre com categoryId existente ⇒ loop sempre retorna antes */
  return true
}

/** Categoria abaixo de outra ainda incompleta → Aguardando. */
function isCategorySectionWaiting(categoryId: string): boolean {
  const category = props.items.find((item) => item.id === categoryId)
  if (!category || category.type !== 'category' || category.done) return false
  return !arePreviousCategoriesDone(categoryId)
}

/** Categoria atual (anteriores ok) com filhos incompletos → Em andamento. */
function isCategorySectionInProgress(categoryId: string): boolean {
  const category = props.items.find((item) => item.id === categoryId)
  if (!category || category.type !== 'category' || category.done) return false
  if (!arePreviousCategoriesDone(categoryId)) return false

  const children = props.items.filter(
    (item) => item.type !== 'category' && item.categoryId === categoryId,
  )
  if (children.length === 0) return true
  return children.some((item) => !item.done)
}
</script>

<template>
  <div class="liturgy-timeline">
    <div
      v-if="items.length === 0"
      class="liturgy-timeline__empty"
    >
      <i
        class="ti ti-playlist-add"
        aria-hidden="true"
      />
      <p class="liturgy-timeline__empty-title">
        {{ t('liturgy.emptyList') }}
      </p>
      <p class="liturgy-timeline__empty-hint">
        {{ t('liturgy.emptyListHint') }}
      </p>
      <p class="liturgy-timeline__clone-note">
        {{
          canClone
            ? t('liturgy.emptyListCloneReady')
            : t('liturgy.emptyListCloneLocked')
        }}
      </p>
      <button
        type="button"
        class="liturgy-timeline__clone"
        :disabled="!canClone"
        @click="emit('clone')"
      >
        <i
          class="ti ti-copy"
          aria-hidden="true"
        />
        {{ t('liturgy.clone.action') }}
      </button>
    </div>

    <div
      v-else
      class="liturgy-timeline__list"
      :class="{ 'liturgy-timeline__list--reordering': dragFrom != null }"
    >
      <div
        class="liturgy-timeline__line"
        aria-hidden="true"
      />

      <template
        v-for="(segment, segmentIndex) in segments"
        :key="`${segment.kind}-${segmentIndex}`"
      >
        <LiturgyTimelineItem
          v-if="segment.kind === 'item'"
          :item="segment.entry.item"
          :index="segment.entry.index"
          :selected="selectedIndex === segment.entry.index"
          :site-projecting="siteProjectionItemId === segment.entry.item.id"
          :video-projecting="videoProjectionItemId === segment.entry.item.id"
          :start-label="startLabels[segment.entry.index] ?? '—'"
          :duration-label="durationLabels[segment.entry.index] ?? '—'"
          :linked="segment.linked"
          :indeterminate="
            segment.entry.item.type === 'category'
              ? isCategoryIndeterminate(segment.entry.item.id)
              : false
          "
          :section-in-progress="
            segment.entry.item.type === 'category'
              ? isCategorySectionInProgress(segment.entry.item.id)
              : false
          "
          :section-waiting="
            segment.entry.item.type === 'category'
              ? isCategorySectionWaiting(segment.entry.item.id)
              : false
          "
          :collapsible="
            segment.entry.item.type === 'category' && segment.childCount > 0
          "
          :collapsed="
            segment.entry.item.type === 'category'
              ? isCategoryCollapsed(segment.entry.item.id)
              : false
          "
          :child-count="segment.childCount"
          :reorder-active="dragFrom != null"
          :is-drag-source="isDragBlockIndex(segment.entry.index)"
          :deletion-locked="deletionLocked"
          :has-instrumental="musicHasInstrumental(segment.entry.item)"
          :music-busy="isMusicBusy(segment.entry.item)"
          @select="emit('select', segment.entry.index)"
          @video-file-selected="
            emit('videoFileSelected', segment.entry.item.id, $event)
          "
          @play-screens="emit('playScreens', segment.entry.index)"
          @edit="emit('edit', segment.entry.index)"
          @add-sub-item="emit('addSubItem', segment.entry.item.id)"
          @remove="emit('remove', segment.entry.index)"
          @toggle-done="emit('toggleDone', segment.entry.index)"
          @toggle-collapse="toggleCategoryCollapse(segment.entry.item.id)"
          @music-sung="emit('musicSung', segment.entry.index)"
          @music-instrumental="emit('musicInstrumental', segment.entry.index)"
          @music-slides="emit('musicSlides', segment.entry.index)"
          @music-lyric="emit('musicLyric', segment.entry.index)"
          @set-player="emit('setPlayer', segment.entry.index, $event)"
          @drag-start="onDragStart"
          @drag-end="onDragEnd"
          @drop="onDrop"
        />

        <div
          v-else-if="!isCategoryCollapsed(segment.categoryId)"
          class="liturgy-timeline__branch"
        >
          <div
            class="liturgy-timeline__branch-line"
            aria-hidden="true"
          />
          <LiturgyTimelineItem
            v-for="child in segment.children"
            :key="child.item.id"
            :item="child.item"
            :index="child.index"
            :selected="selectedIndex === child.index"
            :site-projecting="siteProjectionItemId === child.item.id"
            :video-projecting="videoProjectionItemId === child.item.id"
            :start-label="startLabels[child.index] ?? '—'"
            :duration-label="durationLabels[child.index] ?? '—'"
            linked
            :reorder-active="dragFrom != null"
            :is-drag-source="isDragBlockIndex(child.index)"
            :deletion-locked="deletionLocked"
            :has-instrumental="musicHasInstrumental(child.item)"
            :music-busy="isMusicBusy(child.item)"
            @select="emit('select', child.index)"
            @play-screens="emit('playScreens', child.index)"
            @edit="emit('edit', child.index)"
            @remove="emit('remove', child.index)"
            @toggle-done="emit('toggleDone', child.index)"
            @music-sung="emit('musicSung', child.index)"
            @music-instrumental="emit('musicInstrumental', child.index)"
            @music-slides="emit('musicSlides', child.index)"
            @music-lyric="emit('musicLyric', child.index)"
            @set-player="emit('setPlayer', child.index, $event)"
            @drag-start="onDragStart"
            @drag-end="onDragEnd"
            @drop="onDrop"
          />
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped lang="scss">
.liturgy-timeline {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding-right: 0.25rem;
}

.liturgy-timeline__empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 0;
  overflow: auto;
  text-align: center;
  opacity: 0.85;

  > i {
    font-size: 3rem;
    margin-bottom: 0.35rem;
    color: var(--ds-color-primary);
  }
}

.liturgy-timeline__empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ds-color-on-surface);
}

.liturgy-timeline__empty-hint {
  margin: 0;
  max-width: 18rem;
  font-size: 0.875rem;
  color: color-mix(in srgb, var(--ds-color-on-surface) 65%, transparent);
  white-space: pre-line;
}

.liturgy-timeline__clone-note {
  margin: 0.85rem 0 0;
  max-width: 18rem;
  font-size: 0.8125rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ds-color-on-surface) 55%, transparent);
}

.liturgy-timeline__clone {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.65rem;
  min-height: 2.25rem;
  padding: 0.4rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    transform 140ms ease,
    opacity 160ms ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  i {
    font-size: 1rem;
  }
}

.liturgy-timeline__list {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-left: 0.15rem;
  padding-right: 0.35rem;
  padding-bottom: 0.5rem;
  width: 100%;

  &--reordering {
    .liturgy-timeline__line,
    .liturgy-timeline__branch-line {
      opacity: 0.28;
    }
  }
}

.liturgy-timeline__line {
  position: absolute;
  left: 0.55rem;
  top: 1rem;
  bottom: 0.4rem;
  width: 2px;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--ds-color-primary) 40%, transparent),
    color-mix(in srgb, var(--ds-color-primary) 5%, transparent)
  );
  pointer-events: none;
}

.liturgy-timeline__branch {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Recuo: sob o conteúdo da categoria (marker + gap + ícone do card). */
  margin-left: calc(1.25rem + 0.65rem + 0.2rem);
  margin-top: -0.2rem;
  padding-left: 1.25rem;
  width: calc(100% - 1.25rem - 0.65rem - 0.2rem);
  box-sizing: border-box;
}

.liturgy-timeline__branch-line {
  position: absolute;
  left: 0.45rem;
  top: 1rem;
  bottom: 1rem;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 55%, transparent),
    color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 12%, transparent)
  );
  pointer-events: none;
}

@media (max-width: 1280px) {
  .liturgy-timeline {
    gap: 0.65rem;
  }

  .liturgy-timeline__empty {
    gap: 0.25rem;

    > i {
      font-size: 2.15rem;
      margin-bottom: 0.15rem;
    }
  }

  .liturgy-timeline__empty-title {
    font-size: 0.9rem;
  }

  .liturgy-timeline__empty-hint {
    font-size: 0.78rem;
  }

  .liturgy-timeline__clone-note {
    margin-top: 0.55rem;
    font-size: 0.72rem;
  }

  .liturgy-timeline__clone {
    margin-top: 0.45rem;
    min-height: 1.85rem;
    padding: 0.3rem 0.75rem;
    font-size: 0.72rem;

    i {
      font-size: 0.9rem;
    }
  }

  .liturgy-timeline__list {
    gap: 0.5rem;
  }
}
</style>
