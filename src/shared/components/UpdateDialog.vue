<script setup lang="ts">
import DOMPurify from 'dompurify'
import { computed } from 'vue'
import { useUpdateChecker } from '@shared/composables/useUpdateChecker'

const model = defineModel<boolean>({ default: false })

const {
  newVersion,
  releaseNotes,
  isDownloading,
  isDownloaded,
  downloadProgress,
  error,
  downloadUpdate,
  installUpdate,
} = useUpdateChecker()

const canInstall = computed(() => isDownloaded.value)
const canDownload = computed(() => !isDownloading.value && !isDownloaded.value)

const safeNotes = computed(() =>
  releaseNotes.value ? DOMPurify.sanitize(releaseNotes.value) : null,
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="model"
      class="update-overlay"
      data-test="update-dialog"
      @click.self="model = false"
    >
      <div class="update-card">
        <div class="update-card__header">
          <h2>Versão {{ newVersion }}</h2>
          <button
            class="close-btn"
            data-test="close-dialog"
            @click="model = false"
          >
            ✕
          </button>
        </div>

        <div class="update-card__body">
          <div
            v-if="error"
            class="error-msg"
            data-test="error-msg"
          >
            {{ error }}
          </div>

          <div
            v-if="safeNotes"
            class="release-notes"
            data-test="release-notes"
            v-html="safeNotes"
          />
          <p
            v-else
            class="release-notes release-notes--empty"
          >
            Sem notas de versão.
          </p>

          <!-- Progresso de download -->
          <div
            v-if="isDownloading"
            class="download-progress"
            data-test="download-progress"
          >
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${downloadProgress}%` }"
              />
            </div>
            <span class="progress-text">{{ downloadProgress }}%</span>
          </div>
        </div>

        <div class="update-card__footer">
          <button
            v-if="canDownload"
            data-test="download-btn"
            class="action-btn action-btn--primary"
            @click="downloadUpdate"
          >
            Baixar atualização
          </button>

          <button
            v-if="canInstall"
            data-test="install-btn"
            class="action-btn action-btn--primary"
            @click="installUpdate"
          >
            Instalar e reiniciar
          </button>

          <button
            data-test="later-btn"
            class="action-btn action-btn--secondary"
            @click="model = false"
          >
            Mais tarde
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.update-card {
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #1e1e2e;
  color: #cdd6f4;
  border-radius: 12px;
  overflow: hidden;
  font-family: sans-serif;
}

.update-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #313244;
}

.update-card__header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  color: #6c7086;
  font-size: 18px;
  cursor: pointer;
}

.close-btn:hover {
  color: #cdd6f4;
}

.update-card__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.error-msg {
  background: #f38ba8;
  color: #1e1e2e;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-weight: 600;
}

.release-notes {
  line-height: 1.6;
  font-size: 14px;
}

.release-notes :deep(h1),
.release-notes :deep(h2),
.release-notes :deep(h3) {
  margin: 12px 0 4px;
  font-size: 15px;
  font-weight: 700;
}

.release-notes :deep(ul) {
  padding-left: 20px;
}

.release-notes :deep(li) {
  margin: 4px 0;
}

.release-notes--empty {
  color: #6c7086;
  font-style: italic;
}

.download-progress {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #313244;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #a6e3a1;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

.update-card__footer {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #313244;
}

.action-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.action-btn--primary:hover {
  background: #74c7ec;
}

.action-btn--secondary {
  background: transparent;
  color: #6c7086;
  border: 1px solid #313244;
}

.action-btn--secondary:hover {
  color: #cdd6f4;
}
</style>
