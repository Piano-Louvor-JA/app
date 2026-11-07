<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { isCarouselKind, isInCarousel, type Announcement, type AnnouncementKind } from '../types/announcements'

const props = defineProps<{
  item: Announcement
  index: number
  total: number
  projecting?: boolean
  missing?: boolean
}>()

const emit = defineEmits<{
  'toggle-carousel': [inCarousel: boolean]
  project: []
  edit: []
  duplicate: []
  remove: []
  move: [from: number, to: number]
}>()

const { t } = useI18n()

const KIND_ICONS: Record<AnnouncementKind, string> = {
  text: 'ti-align-left',
  images: 'ti-photo',
  video: 'ti-video',
  presentation: 'ti-presentation',
  url: 'ti-link',
}

const icon = computed(() => KIND_ICONS[props.item.kind])
const canCarousel = computed(() => isCarouselKind(props.item.kind))
const inCarousel = computed(() => isInCarousel(props.item))

const subtitle = computed(() => {
  const item = props.item
  switch (item.kind) {
    case 'text':
      return item.plainText.split('\n').find((line) => line.trim()) ?? ''
    case 'images':
      return t('announcements.imagesCount', item.files.length)
    case 'url':
      return item.url
    default:
      return item.file?.name || t('announcements.noFile')
  }
})

const dragOver = ref(false)
const DRAG_TYPE = 'application/x-louvorja-announcement-index'

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData(DRAG_TYPE, String(props.index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
  event.preventDefault()
  dragOver.value = true
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const from = Number(event.dataTransfer?.getData(DRAG_TYPE))
  if (Number.isInteger(from) && from !== props.index) emit('move', from, props.index)
}

/** Teclado: Alt+↑/↓ reordena sem mouse. */
function onKeydown(event: KeyboardEvent) {
  if (!event.altKey) return
  if (event.key === 'ArrowUp' && props.index > 0) {
    event.preventDefault()
    emit('move', props.index, props.index - 1)
  } else if (event.key === 'ArrowDown' && props.index < props.total - 1) {
    event.preventDefault()
    emit('move', props.index, props.index + 1)
  }
}
</script>

<template>
  <li
    class="announcement-row"
    :class="{
      'announcement-row--projecting': projecting,
      'announcement-row--drag-over': dragOver,
      'announcement-row--missing': missing,
    }"
    draggable="true"
    tabindex="0"
    :data-kind="item.kind"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @dragleave="dragOver = false"
    @drop="onDrop"
    @keydown="onKeydown"
    @dblclick="emit('edit')"
  >
    <span
      class="announcement-row__handle"
      :title="t('announcements.actions.drag')"
      aria-hidden="true"
    >
      <i class="ti ti-grip-vertical" />
    </span>
    <span class="announcement-row__icon">
      <i
        class="ti"
        :class="icon"
        aria-hidden="true"
      />
    </span>
    <div class="announcement-row__body">
      <p class="announcement-row__title">
        {{ item.title || t('announcements.untitled') }}
        <span
          v-if="missing"
          class="announcement-row__badge"
          data-test="missing-badge"
        >
          {{ t('announcements.missingBadge') }}
        </span>
      </p>
      <p class="announcement-row__subtitle">
        <span class="announcement-row__kind">{{ t(`announcements.kinds.${item.kind}`) }}</span>
        <span
          v-if="subtitle"
          data-test="row-subtitle"
        >· {{ subtitle }}</span>
      </p>
    </div>
    <div
      class="announcement-row__actions"
      role="group"
      :aria-label="t('announcements.actions.label')"
    >
      <button
        v-if="canCarousel"
        type="button"
        class="announcement-row__btn announcement-row__btn--carousel"
        :class="{ 'is-on': inCarousel }"
        :title="inCarousel ? t('announcements.actions.carouselOn') : t('announcements.actions.carouselOff')"
        :aria-label="inCarousel ? t('announcements.actions.carouselOn') : t('announcements.actions.carouselOff')"
        :aria-pressed="inCarousel ? 'true' : 'false'"
        data-test="row-carousel"
        @click="emit('toggle-carousel', !inCarousel)"
      >
        <i
          class="ti ti-slideshow"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-row__btn announcement-row__btn--project"
        :title="projecting ? t('announcements.actions.stop') : t('announcements.actions.project')"
        :aria-label="projecting ? t('announcements.actions.stop') : t('announcements.actions.project')"
        :aria-pressed="projecting ? 'true' : 'false'"
        data-test="row-project"
        @click="emit('project')"
      >
        <i
          class="ti"
          :class="projecting ? 'ti-player-stop' : 'ti-player-play'"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-row__btn"
        :title="t('announcements.actions.edit')"
        :aria-label="t('announcements.actions.edit')"
        data-test="row-edit"
        @click="emit('edit')"
      >
        <i
          class="ti ti-pencil"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-row__btn"
        :title="t('announcements.actions.duplicate')"
        :aria-label="t('announcements.actions.duplicate')"
        data-test="row-duplicate"
        @click="emit('duplicate')"
      >
        <i
          class="ti ti-copy"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-row__btn announcement-row__btn--danger"
        :title="t('announcements.actions.remove')"
        :aria-label="t('announcements.actions.remove')"
        data-test="row-remove"
        @click="emit('remove')"
      >
        <i
          class="ti ti-trash"
          aria-hidden="true"
        />
      </button>
    </div>
  </li>
</template>

<style scoped lang="scss">
.announcement-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 9%, transparent);
  border-radius: 0.75rem 0 0.75rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
  list-style: none;
  transition: border-color 160ms ease, background-color 160ms ease;

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }

  &--projecting {
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  &--drag-over {
    border-style: dashed;
    border-color: var(--ds-color-primary);
  }

  &--missing .announcement-row__icon {
    color: var(--ds-color-error, #ffb4ab);
  }
}

.announcement-row__handle {
  color: var(--ds-color-on-surface-variant);
  cursor: grab;
  opacity: 0.6;
}

.announcement-row__icon {
  display: flex;
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem 0 0.6rem 0;
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.2rem;
  }
}

.announcement-row__body {
  min-width: 0;
  flex: 1;
}

.announcement-row__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  overflow: hidden;
  color: var(--ds-color-on-surface);
  font-size: 0.95rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-row__badge {
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
  color: var(--ds-color-error, #ffb4ab);
  font-size: 0.7rem;
  font-weight: 700;
}

.announcement-row__subtitle {
  margin: 0.15rem 0 0;
  overflow: hidden;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-row__kind {
  font-weight: 600;
}

.announcement-row__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.2rem;
}

.announcement-row__btn {
  display: inline-flex;
  width: 2.1rem;
  height: 2.1rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
    color: var(--ds-color-on-surface);
  }

  &--project {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    color: var(--ds-color-primary);
  }

  &--danger:hover {
    color: var(--ds-color-error, #ffb4ab);
  }

  &--carousel {
    opacity: 0.55;

    &.is-on {
      color: var(--ds-color-primary);
      opacity: 1;
    }
  }

  .ti {
    font-size: 1.05rem;
  }
}
</style>
