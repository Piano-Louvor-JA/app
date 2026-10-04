<script setup lang="ts">
defineProps<{
	open: boolean;
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	danger?: boolean;
}>();

const emit = defineEmits<{
	confirm: [];
	cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-confirm"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div
        class="app-confirm__backdrop"
        aria-hidden="true"
        @click="emit('cancel')"
      />
      <div class="app-confirm__panel">
        <p class="app-confirm__title">
          {{ title }}
        </p>
        <p class="app-confirm__message">
          {{ message }}
        </p>
        <div class="app-confirm__actions">
          <button
            type="button"
            class="app-confirm__btn"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="app-confirm__btn app-confirm__btn--primary"
            :class="{ 'app-confirm__btn--danger': danger }"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.app-confirm {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-confirm__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
}

.app-confirm__panel {
  position: relative;
  z-index: 1;
  width: min(32rem, calc(100% - 2rem));
  padding: 1.25rem 1.25rem 1rem;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 1rem 0 1rem 0;
  background: #2a2a2a;
  box-shadow: 0 18px 50px rgb(0 0 0 / 0.5);
}

.app-confirm__title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  color: #fff;
}

.app-confirm__message {
  margin: 0 0 1.15rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: rgb(255 255 255 / 0.78);
}

.app-confirm__actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  justify-content: flex-end;
}

.app-confirm__btn {
  border: none;
  border-radius: 999px;
  padding: 0.45rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  color: #1a1a1a;
  background: color-mix(in srgb, #a0a0a0 55%, #2a2a2a);
  cursor: pointer;
  transition: filter 0.15s ease;
}

.app-confirm__btn:hover {
  filter: brightness(1.12);
}

.app-confirm__btn--primary {
  background: var(--ds-color-primary, #2196f3);
  color: #fff;
}

.app-confirm__btn--danger {
  background: color-mix(in srgb, #e57373 75%, #4a2a2a);
  color: #1a1a1a;
}
</style>
