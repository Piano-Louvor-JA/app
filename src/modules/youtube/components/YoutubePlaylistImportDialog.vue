<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { YoutubeSearchItem } from '@shared/types/desktop-bridge'

import { isPlaylistLink } from '../services/youtube-links'
import { fetchYoutubePlaylist } from '../services/youtube-player'

/**
 * "Colar playlist do YouTube": cola o link, o app lê os vídeos e pede o nome da coletânea
 * (sugere o título da playlist). Quem cria a coletânea é a tela, pelo evento `create`.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; create: [name: string, items: YoutubeSearchItem[]] }>()

const { t } = useI18n()

type Step = 'url' | 'loading' | 'name'
const step = ref<Step>('url')
const url = ref('')
const name = ref('')
const items = ref<YoutubeSearchItem[]>([])
const playlistTitle = ref('')
const errorKey = ref('')
const urlInput = ref<HTMLInputElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
let seq = 0

const preview = computed(() => items.value.slice(0, 4))

watch(() => props.open, (open) => {
  if (!open) return
  seq += 1
  step.value = 'url'
  url.value = ''
  name.value = ''
  items.value = []
  playlistTitle.value = ''
  errorKey.value = ''
  void nextTick(() => urlInput.value?.focus())
})

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return
    url.value = text.trim()
    if (isPlaylistLink(url.value)) void load()
  } catch {
    // sem permissão de leitura: a pessoa cola com Ctrl+V
  }
}

/** Colou um link de playlist (Ctrl+V): já lê, sem precisar de "Continuar". */
function onUrlPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text')?.trim() ?? ''
  if (!isPlaylistLink(pasted) || step.value === 'loading') return
  event.preventDefault()
  url.value = pasted
  void load()
}

async function load() {
  const text = url.value.trim()
  if (!text) return
  const mine = ++seq
  step.value = 'loading'
  errorKey.value = ''
  const result = await fetchYoutubePlaylist(text)
  if (mine !== seq) return
  if (result.items.length === 0) {
    step.value = 'url'
    errorKey.value = result.error === 'invalid'
      ? 'youtube.playlist.invalid'
      : result.error === 'empty'
        ? 'youtube.playlist.empty'
        : 'youtube.playlist.error'
    return
  }
  items.value = result.items
  playlistTitle.value = result.title
  name.value = result.title || t('youtube.playlist.defaultName')
  step.value = 'name'
  void nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

function create() {
  const clean = name.value.trim()
  if (!clean || items.value.length === 0) return
  emit('create', clean, items.value)
}

function close() {
  seq += 1
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="yt-pl"
    role="dialog"
    aria-modal="true"
    :aria-label="t('youtube.playlist.title')"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="yt-pl__panel">
      <header class="yt-pl__head">
        <h2><i class="ti ti-brand-youtube" aria-hidden="true" /> {{ t('youtube.playlist.title') }}</h2>
        <button type="button" class="yt-pl__x" :aria-label="t('youtube.collections.close')" @click="close">
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </header>

      <!-- 1. Link -->
      <form v-if="step !== 'name'" class="yt-pl__body" @submit.prevent="load">
        <p class="yt-pl__hint">{{ t('youtube.playlist.urlHint') }}</p>
        <div class="yt-pl__row">
          <input
            ref="urlInput"
            v-model="url"
            type="text"
            :placeholder="t('youtube.playlist.urlPlaceholder')"
            :disabled="step === 'loading'"
            data-testid="youtube-playlist-url"
            @paste="onUrlPaste"
          >
          <button type="button" class="yt-pl__btn" :disabled="step === 'loading'" :title="t('youtube.playlist.paste')" @click="pasteFromClipboard">
            <i class="ti ti-clipboard" aria-hidden="true" />
            {{ t('youtube.playlist.paste') }}
          </button>
        </div>
        <p v-if="errorKey" class="yt-pl__error" role="alert">{{ t(errorKey) }}</p>
        <footer class="yt-pl__foot">
          <button type="button" class="yt-pl__btn" @click="close">{{ t('youtube.history.cancel') }}</button>
          <button
            type="submit"
            class="yt-pl__btn yt-pl__btn--primary"
            :disabled="step === 'loading' || !url.trim()"
            data-testid="youtube-playlist-load"
          >
            <i class="ti" :class="step === 'loading' ? 'ti-loader-2 yt-pl__spin' : 'ti-arrow-right'" aria-hidden="true" />
            {{ step === 'loading' ? t('youtube.playlist.loading') : t('youtube.playlist.next') }}
          </button>
        </footer>
      </form>

      <!-- 2. Nome da coletânea -->
      <form v-else class="yt-pl__body" @submit.prevent="create">
        <div class="yt-pl__found">
          <div class="yt-pl__thumbs" aria-hidden="true">
            <img v-for="item in preview" :key="item.videoId" :src="item.thumbnail" alt="" loading="lazy">
          </div>
          <div class="yt-pl__found-text">
            <strong>{{ playlistTitle || t('youtube.playlist.defaultName') }}</strong>
            <span>{{ t('youtube.playlist.found', { n: items.length }) }}</span>
          </div>
        </div>
        <label class="yt-pl__label" for="yt-pl-name">{{ t('youtube.playlist.nameLabel') }}</label>
        <input
          id="yt-pl-name"
          ref="nameInput"
          v-model="name"
          type="text"
          :maxlength="80"
          data-testid="youtube-playlist-name"
        >
        <footer class="yt-pl__foot">
          <button type="button" class="yt-pl__btn" @click="step = 'url'">
            <i class="ti ti-arrow-left" aria-hidden="true" />
            {{ t('youtube.playlist.back') }}
          </button>
          <span class="yt-pl__spacer" />
          <button
            type="submit"
            class="yt-pl__btn yt-pl__btn--primary"
            :disabled="!name.trim()"
            data-testid="youtube-playlist-create"
          >
            <i class="ti ti-playlist-add" aria-hidden="true" />
            {{ t('youtube.playlist.create') }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.yt-pl {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}

.yt-pl__panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: min(34rem, 100%);
  padding: 1.15rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 18px 50px rgb(0 0 0 / 50%);
}

.yt-pl__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  h2 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1.1rem; .ti { color: var(--ds-color-primary); } }
}

.yt-pl__x {
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

.yt-pl__body { display: flex; flex-direction: column; gap: 0.75rem; }
.yt-pl__hint { margin: 0; font-size: 0.85rem; color: var(--ds-color-on-surface-variant); }
.yt-pl__row { display: flex; gap: 0.5rem; }

.yt-pl input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--ds-color-outline-strong, var(--ds-color-outline));
  border-radius: 0.5rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  outline: none;
  &:focus { border-color: var(--ds-color-primary); }
}

.yt-pl__error { margin: 0; font-size: 0.85rem; color: var(--ds-color-error, #e5484d); }

.yt-pl__found {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.7rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
}

.yt-pl__thumbs {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  width: 6.5rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 0.4rem;
  background: #000;
  img { width: 100%; height: 100%; object-fit: cover; }
}

.yt-pl__found-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  span { font-size: 0.85rem; color: var(--ds-color-on-surface-variant); }
}

.yt-pl__label { font-size: 0.85rem; font-weight: 600; }

.yt-pl__foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; }
.yt-pl__spacer { flex: 1; }

.yt-pl__btn {
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
  white-space: nowrap;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
  &--primary { border-color: transparent; background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
}

.yt-pl__spin { animation: yt-pl-spin 0.9s linear infinite; }
@keyframes yt-pl-spin { to { transform: rotate(360deg); } }
</style>
