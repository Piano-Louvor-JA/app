<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

const props = defineProps<{
  open: boolean
  title: string
  initialName?: string
}>()

const emit = defineEmits<{
  close: []
  save: [name: string]
}>()

const { t } = useI18n()
const name = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    name.value = props.initialName ?? ''
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
  { immediate: true },
)

function submit() {
  emit('save', name.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="announcement-name"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown.esc="emit('close')"
    >
      <GlassCard
        class="announcement-name__panel"
        elevated
      >
        <form @submit.prevent="submit">
          <h2 class="announcement-name__title">
            {{ title }}
          </h2>
          <label class="announcement-name__label">
            {{ t('announcements.lists.nameLabel') }}
            <input
              ref="input"
              v-model="name"
              class="announcement-name__input"
              type="text"
              maxlength="80"
              data-test="list-name-input"
            >
          </label>
          <div class="announcement-name__actions">
            <button
              type="button"
              class="announcement-name__btn"
              @click="emit('close')"
            >
              {{ t('announcements.cancel') }}
            </button>
            <button
              type="submit"
              class="announcement-name__btn announcement-name__btn--primary"
              data-test="list-name-save"
            >
              {{ t('announcements.save') }}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.announcement-name {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}

.announcement-name__panel {
  width: min(26rem, 100%);
}

.announcement-name__title {
  margin: 0 0 1rem;
  color: var(--ds-color-on-surface);
  font-size: 1.1rem;
  font-weight: 600;
}

.announcement-name__label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;
}

.announcement-name__input {
  height: 2.5rem;
  padding: 0 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.95rem;

  &:focus {
    border-color: var(--ds-color-primary);
    outline: none;
  }
}

.announcement-name__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.announcement-name__btn {
  height: 2.35rem;
  padding: 0 1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: 0.5rem 0 0.5rem 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-weight: 600;

  &--primary {
    border-color: transparent;
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }
}
</style>
