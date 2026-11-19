<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { MAX_FILE_TITLE_CHARS, editableFileTitle, sanitizeFileTitle, videoFileName } from '../services/video-file-name'

/**
 * "Renomear arquivo baixado": a pessoa edita o nome e vê na hora como o arquivo vai ficar na
 * pasta (sem acento nem símbolo, com o código do vídeo no fim). Quem renomeia é a tela, pelo
 * evento `confirm`.
 */
const props = defineProps<{ open: boolean; videoId: string; title: string; fileName?: string }>()
const emit = defineEmits<{ close: []; confirm: [name: string] }>()

const { t } = useI18n()

const name = ref('')
const input = ref<HTMLInputElement | null>(null)

const preview = computed(() => videoFileName(name.value, props.videoId))
const unchanged = computed(() => preview.value === (props.fileName ?? videoFileName(props.title, props.videoId)))

watch(() => props.open, (open) => {
  if (!open) return
  name.value = editableFileTitle(props.fileName, props.videoId) || sanitizeFileTitle(props.title)
  void nextTick(() => {
    input.value?.focus()
    input.value?.select()
  })
})

function confirm() {
  if (unchanged.value) {
    emit('close')
    return
  }
  emit('confirm', name.value)
}
</script>

<template>
  <div
    v-if="open"
    class="yt-rn"
    role="dialog"
    aria-modal="true"
    :aria-label="t('youtube.download.renameTitle')"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <form class="yt-rn__panel" @submit.prevent="confirm">
      <header class="yt-rn__head">
        <h2><i class="ti ti-pencil" aria-hidden="true" /> {{ t('youtube.download.renameTitle') }}</h2>
        <button type="button" class="yt-rn__x" :aria-label="t('youtube.collections.close')" @click="emit('close')">
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </header>
      <p class="yt-rn__video" :title="title">{{ title }}</p>
      <label class="yt-rn__label" for="yt-rn-name">{{ t('youtube.download.renameLabel') }}</label>
      <input
        id="yt-rn-name"
        ref="input"
        v-model="name"
        type="text"
        :maxlength="MAX_FILE_TITLE_CHARS * 2"
        data-testid="youtube-rename-input"
      >
      <p class="yt-rn__hint">{{ t('youtube.download.renameHint', { n: MAX_FILE_TITLE_CHARS }) }}</p>
      <p class="yt-rn__preview">
        <span>{{ t('youtube.download.renamePreview') }}</span>
        <code data-testid="youtube-rename-preview">{{ preview }}</code>
      </p>
      <footer class="yt-rn__foot">
        <button type="button" class="yt-rn__btn" @click="emit('close')">{{ t('youtube.history.cancel') }}</button>
        <button type="submit" class="yt-rn__btn yt-rn__btn--primary" data-testid="youtube-rename-confirm">
          <i class="ti ti-check" aria-hidden="true" />
          {{ t('youtube.download.renameConfirm') }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped lang="scss">
.yt-rn {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}

.yt-rn__panel {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  width: min(34rem, 100%);
  padding: 1.15rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 18px 50px rgb(0 0 0 / 50%);
}

.yt-rn__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  h2 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1.1rem; .ti { color: var(--ds-color-primary); } }
}

.yt-rn__x {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent); }
}

.yt-rn__video {
  margin: 0;
  overflow: hidden;
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.yt-rn__label { font-size: 0.85rem; font-weight: 600; }

.yt-rn input {
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--ds-color-outline-strong, var(--ds-color-outline));
  border-radius: 0.5rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  outline: none;
  &:focus { border-color: var(--ds-color-primary); }
}

.yt-rn__hint { margin: 0; font-size: 0.8rem; color: var(--ds-color-on-surface-variant); }

.yt-rn__preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
  span { font-size: 0.78rem; color: var(--ds-color-on-surface-variant); }
  code { font-size: 0.85rem; word-break: break-all; }
}

.yt-rn__foot { display: flex; justify-content: flex-end; gap: 0.5rem; }

.yt-rn__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  &--primary { border-color: transparent; background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
}
</style>
