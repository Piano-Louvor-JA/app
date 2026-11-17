<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { OnlineVideoFolder, OnlineVideoFolderInfo, OnlineVideoStatus } from '@shared/types/desktop-bridge'

/**
 * "Onde salvar?" do botão Baixar: as mesmas duas pastas de Configurações → Mídia & Player.
 * A escolha vira a pasta padrão (lá também). A pasta personalizada só é escolhida aqui quando
 * ainda não existe; trocar depois é em Configurações (link no rodapé).
 */
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()

const { t } = useI18n()
const router = useRouter()

const api = window.louvorja?.isElectron ? window.louvorja.onlineVideo : undefined
const status = ref<OnlineVideoStatus | null>(null)
const selected = ref<OnlineVideoFolder>('system')
const busy = ref(false)

const GB = 1024 ** 3
const MB = 1024 ** 2

const folders = computed(() => {
  const st = status.value
  const system: OnlineVideoFolderInfo | null =
    st?.folders?.system ?? (st ? { dir: st.cacheDir ?? '', bytes: st.usage.bytes, count: st.usage.count, limitBytes: st.usage.limitBytes } : null)
  return { system, custom: st?.folders?.custom ?? null }
})

function sizeText(info: OnlineVideoFolderInfo) {
  const size = info.bytes >= GB ? `${(info.bytes / GB).toFixed(1)} GB` : `${Math.round(info.bytes / MB)} MB`
  return t('settings.youtubeOffline.folderSize', { size, count: info.count })
}

async function load() {
  if (!api) return
  try {
    status.value = await api.status()
    selected.value = status.value.folders?.active ?? 'system'
  } catch {
    status.value = null
  }
}

watch(() => props.open, (open) => { if (open) void load() }, { immediate: true })

async function chooseFolder() {
  if (!api?.chooseFolder || busy.value) return
  busy.value = true
  try {
    status.value = await api.chooseFolder()
    if (status.value.folders?.custom) selected.value = 'custom'
  } finally {
    busy.value = false
  }
}

function pick(which: OnlineVideoFolder) {
  if (which === 'custom' && !folders.value.custom) {
    void chooseFolder()
    return
  }
  selected.value = which
}

async function confirm() {
  if (!api || busy.value) return
  busy.value = true
  try {
    // A escolha fica como padrão para os próximos downloads (e aparece em Configurações).
    if ((status.value?.folders?.active ?? 'system') !== selected.value) {
      status.value = await api.setSettings({ folder: selected.value })
    }
    emit('confirm')
  } finally {
    busy.value = false
  }
}

function openSettings() {
  emit('close')
  void router.push({ name: 'settings-media' })
}
</script>

<template>
  <div
    v-if="open"
    class="yt-dlg"
    role="dialog"
    aria-modal="true"
    :aria-label="t('youtube.download.where')"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="yt-dlg__panel">
      <header class="yt-dlg__head">
        <div class="yt-dlg__heading">
          <h2><i class="ti ti-download" aria-hidden="true" /> {{ t('youtube.download.where') }}</h2>
          <p :title="title">{{ title }}</p>
        </div>
        <button type="button" class="yt-dlg__x" :aria-label="t('youtube.collections.close')" @click="emit('close')">
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </header>

      <div class="yt-dlg__options" role="radiogroup" :aria-label="t('youtube.download.where')">
        <button
          v-if="folders.system"
          type="button"
          role="radio"
          class="yt-dlg__opt"
          :class="{ 'is-on': selected === 'system' }"
          :aria-checked="selected === 'system'"
          data-testid="youtube-download-system"
          @click="pick('system')"
        >
          <span class="yt-dlg__radio" aria-hidden="true" />
          <span class="yt-dlg__info">
            <strong>{{ t('settings.youtubeOffline.folderSystem') }}</strong>
            <code>{{ folders.system.dir }}</code>
            <small>{{ sizeText(folders.system) }}</small>
          </span>
        </button>

        <button
          v-if="folders.custom"
          type="button"
          role="radio"
          class="yt-dlg__opt"
          :class="{ 'is-on': selected === 'custom' }"
          :aria-checked="selected === 'custom'"
          data-testid="youtube-download-custom"
          @click="pick('custom')"
        >
          <span class="yt-dlg__radio" aria-hidden="true" />
          <span class="yt-dlg__info">
            <strong>{{ t('settings.youtubeOffline.folderCustom') }}</strong>
            <code>{{ folders.custom.dir }}</code>
            <small>{{ sizeText(folders.custom) }}</small>
          </span>
        </button>
        <div v-else class="yt-dlg__opt yt-dlg__opt--empty">
          <span class="yt-dlg__radio" aria-hidden="true" />
          <span class="yt-dlg__info">
            <strong>{{ t('settings.youtubeOffline.folderCustom') }}</strong>
            <small>{{ t('settings.youtubeOffline.folderCustomHint') }}</small>
            <button
              type="button"
              class="yt-dlg__choose"
              :disabled="busy || !api?.chooseFolder"
              data-testid="youtube-download-choose"
              @click="chooseFolder"
            >
              <i class="ti ti-folder-plus" aria-hidden="true" />
              {{ t('settings.youtubeOffline.chooseFolder') }}
            </button>
          </span>
        </div>
      </div>

      <p class="yt-dlg__note">{{ t('youtube.download.defaultNote') }}</p>

      <footer class="yt-dlg__foot">
        <button type="button" class="yt-dlg__link" data-testid="youtube-download-settings" @click="openSettings">
          <i class="ti ti-settings" aria-hidden="true" />
          {{ t('youtube.download.manage') }}
        </button>
        <span class="yt-dlg__spacer" />
        <button type="button" class="yt-dlg__btn" @click="emit('close')">{{ t('youtube.history.cancel') }}</button>
        <button
          type="button"
          class="yt-dlg__btn yt-dlg__btn--primary"
          :disabled="busy || !status"
          data-testid="youtube-download-confirm"
          @click="confirm"
        >
          <i class="ti ti-download" aria-hidden="true" />
          {{ t('youtube.download.action') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.yt-dlg {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}

.yt-dlg__panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: min(36rem, 100%);
  max-height: 85vh;
  overflow-y: auto;
  padding: 1.15rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-elevated, #1e1e1e);
  color: var(--ds-color-on-surface);
  box-shadow: 0 18px 50px rgb(0 0 0 / 50%);
}

.yt-dlg__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.yt-dlg__heading {
  min-width: 0;
  h2 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1.1rem; .ti { color: var(--ds-color-primary); } }
  p { margin: 0.25rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; color: var(--ds-color-on-surface-variant); }
}

.yt-dlg__x {
  flex: none;
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

.yt-dlg__options { display: flex; flex-direction: column; gap: 0.6rem; }

.yt-dlg__opt {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.6rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent); }
  &.is-on {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  }
  &--empty { cursor: default; &:hover { border-color: var(--ds-color-outline); } }
}

.yt-dlg__radio {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin-top: 0.15rem;
  border: 2px solid color-mix(in srgb, var(--ds-color-on-surface) 45%, transparent);
  border-radius: 50%;
  .is-on & {
    border-color: var(--ds-color-primary);
    box-shadow: inset 0 0 0 3px var(--ds-color-surface-elevated, #1e1e1e), inset 0 0 0 8px var(--ds-color-primary);
  }
}

.yt-dlg__info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
  strong { font-size: 0.92rem; }
  code {
    padding: 0.25rem 0.5rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }
  small { font-size: 0.78rem; color: var(--ds-color-on-surface-variant); }
}

.yt-dlg__choose {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--ds-color-primary);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--ds-color-primary) 15%, transparent);
  color: var(--ds-color-on-surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
}

.yt-dlg__note { margin: 0; font-size: 0.8rem; color: var(--ds-color-on-surface-variant); }

.yt-dlg__foot { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.yt-dlg__spacer { flex: 1; }

.yt-dlg__link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-primary);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { text-decoration: underline; }
}

.yt-dlg__btn {
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
  &:disabled { opacity: 0.5; cursor: default; }
  &--primary { border-color: transparent; background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
}
</style>
