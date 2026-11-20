<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { AnnouncementList } from '../types/announcements'

defineProps<{
  lists: AnnouncementList[]
  activeListId: string
}>()

const emit = defineEmits<{
  select: [listId: string]
  create: []
  rename: []
  duplicate: []
  remove: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="announcement-lists">
    <div
      class="announcement-lists__chips"
      role="tablist"
      :aria-label="t('announcements.lists.label')"
    >
      <button
        v-for="list in lists"
        :key="list.id"
        type="button"
        role="tab"
        class="announcement-lists__chip"
        :class="{ 'announcement-lists__chip--active': list.id === activeListId }"
        :aria-selected="list.id === activeListId"
        data-test="list-chip"
        @click="emit('select', list.id)"
      >
        {{ list.name }}
        <span class="announcement-lists__count">{{ list.items.length }}</span>
      </button>
      <button
        type="button"
        class="announcement-lists__icon"
        :title="t('announcements.lists.new')"
        :aria-label="t('announcements.lists.new')"
        data-test="list-create"
        @click="emit('create')"
      >
        <i
          class="ti ti-plus"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      class="announcement-lists__actions"
      role="group"
      :aria-label="t('announcements.lists.actions')"
    >
      <button
        type="button"
        class="announcement-lists__icon"
        :title="t('announcements.lists.rename')"
        :aria-label="t('announcements.lists.rename')"
        data-test="list-rename"
        @click="emit('rename')"
      >
        <i
          class="ti ti-pencil"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-lists__icon"
        :title="t('announcements.lists.duplicate')"
        :aria-label="t('announcements.lists.duplicate')"
        data-test="list-duplicate"
        @click="emit('duplicate')"
      >
        <i
          class="ti ti-copy"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="announcement-lists__icon announcement-lists__icon--danger"
        :title="t('announcements.lists.remove')"
        :aria-label="t('announcements.lists.remove')"
        data-test="list-remove"
        @click="emit('remove')"
      >
        <i
          class="ti ti-trash"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.announcement-lists {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.announcement-lists__chips {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.announcement-lists__chip {
  display: inline-flex;
  height: 2.1rem;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 0.6rem 0 0.6rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;

  &--active {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    color: var(--ds-color-primary);
  }
}

.announcement-lists__count {
  min-width: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  font-size: 0.7rem;
  text-align: center;
}

.announcement-lists__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.25rem;
}

.announcement-lists__icon {
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

  &--danger:hover {
    color: var(--ds-color-error, #ffb4ab);
  }

  .ti {
    font-size: 1.1rem;
  }
}
</style>
