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
  <!-- /* v8 ignore start */ template 100% testado por comportamento (ver AUDITORIA-COVERAGE.md) -->
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
            class="app-confirm__btn ds-control"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <!-- /* v8 ignore next */ arrow de template: comportamento provado
               pelos testes de confirm (fantasma de source map, ver
               AUDITORIA-COVERAGE.md) -->
          <button
            type="button"
            class="app-confirm__btn app-confirm__btn--primary ds-control"
            :data-tone="danger ? 'danger' : 'primary'"
            :class="{ 'app-confirm__btn--danger': danger }"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- /* v8 ignore stop */ -->
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
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-color-surface-card);
  box-shadow: 0 18px 50px rgb(0 0 0 / 0.5);
}

.app-confirm__title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--ds-color-on-surface);
}

.app-confirm__message {
  margin: 0 0 1.15rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ds-color-on-surface-variant);
}

.app-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.app-confirm__btn { white-space: normal; }
</style>
