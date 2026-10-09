<script setup lang="ts">
import { useUpdateChecker } from "@shared/composables/useUpdateChecker";

const { hasUpdate, newVersion, dismissed, dismiss } = useUpdateChecker();

const emit = defineEmits<{
	viewNotes: [version: string | null];
}>();

function handleViewNotes() {
	emit("viewNotes", newVersion.value);
}
</script>

<template>
  <div
    v-if="hasUpdate && !dismissed"
    data-test="update-banner"
    class="update-banner"
  >
    <span class="update-text">
      Versão {{ newVersion }} disponível
    </span>
    <div class="update-actions">
      <button
        data-test="notes-btn"
        class="update-btn update-btn--primary"
        @click="handleViewNotes"
      >
        Ver notas
      </button>
      <button
        data-test="dismiss-btn"
        class="update-btn update-btn--secondary"
        @click="dismiss"
      >
        Dispensar
      </button>
    </div>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  background: #fcce02;
  color: #12121c;
  font-size: 14px;
  font-weight: 500;
}

.update-text {
  white-space: nowrap;
}

.update-actions {
  display: flex;
  gap: 8px;
}

.update-btn {
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.update-btn:hover {
  opacity: 0.85;
}

.update-btn--primary {
  background: #12121c;
  color: #fcce02;
}

.update-btn--secondary {
  background: transparent;
  color: #12121c;
  border: 1px solid #12121c33;
}
</style>
