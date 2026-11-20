<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Playlist, PlaylistItem } from '../services/playlist-storage'

const props = defineProps<{
  item: PlaylistItem | null
  playlists: Playlist[]
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <Transition name="playlist-picker">
      <div
        v-if="props.item"
        class="playlist-picker"
        role="dialog"
        aria-modal="true"
        :aria-label="t('common.addToPlaylist')"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <div class="playlist-picker__panel">
          <header class="playlist-picker__header">
            <div class="playlist-picker__track">
              <span class="playlist-picker__track-icon"><i class="ti ti-music" aria-hidden="true" /></span>
              <div class="playlist-picker__track-info">
                <small>{{ t('common.addToPlaylist') }}</small>
                <strong>{{ props.item.title }}</strong>
              </div>
            </div>
            <button type="button" class="playlist-picker__close" :aria-label="t('common.close')" @click="emit('close')">
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>

          <div class="playlist-picker__body">
            <p v-if="props.playlists.length === 0" class="playlist-picker__empty">
              <i class="ti ti-music-plus" aria-hidden="true" />
              Você ainda não tem playlists.<br>
              Crie uma na seção Playlists da Biblioteca.
            </p>
            <button
              v-for="playlist in props.playlists"
              :key="playlist.id"
              type="button"
              class="playlist-picker__option"
              @click="emit('select', playlist.id)"
            >
              <i class="ti ti-playlist" aria-hidden="true" />
              <span class="playlist-picker__name">{{ playlist.name }}</span>
              <small class="playlist-picker__count">{{ playlist.items.length }}</small>
              <i class="ti ti-plus playlist-picker__add" aria-hidden="true" />
            </button>
          </div>

          <footer class="playlist-picker__footer">
            <button type="button" class="playlist-picker__cancel" @click="emit('close')">Cancelar</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.playlist-picker { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 0.55); backdrop-filter: blur(4px); }
.playlist-picker__panel { display: flex; flex-direction: column; width: min(26rem, calc(100vw - 2rem)); max-height: min(30rem, calc(100vh - 4rem)); border: 1px solid var(--ds-color-outline-strong, rgba(255,255,255,.1)); border-radius: var(--ds-radius-lg, 16px 0 16px 0); background: var(--ds-color-surface-card, #242424); box-shadow: 0 24px 64px rgb(0 0 0 / .5); overflow: hidden; }
.playlist-picker__header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: 1rem 1.1rem; border-bottom: 1px solid var(--ds-color-outline, rgba(255,255,255,.05)); background: color-mix(in srgb, var(--ds-color-surface-container, #201f1f) 70%, transparent); }
.playlist-picker__track { display: inline-flex; align-items: center; gap: .75rem; min-width: 0; }
.playlist-picker__track-icon { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: var(--ds-radius-sm, 8px 0 8px 0); background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 18%, transparent); color: var(--ds-color-primary, #2196f3); font-size: 1.1rem; }
.playlist-picker__track-info { display: flex; flex-direction: column; min-width: 0; }
.playlist-picker__track-info small { color: var(--ds-color-on-surface-variant, #bfc7d4); font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; }
.playlist-picker__track-info strong { color: var(--ds-color-on-surface, #e5e2e1); font-size: .95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.playlist-picker__close { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; flex-shrink: 0; border: 0; border-radius: var(--ds-radius-sm, 8px 0 8px 0); background: transparent; color: var(--ds-color-on-surface-variant, #bfc7d4); cursor: pointer; }
.playlist-picker__body { display: flex; flex: 1; flex-direction: column; gap: .35rem; overflow-y: auto; padding: .65rem; }
.playlist-picker__option { display: inline-flex; align-items: center; gap: .65rem; padding: .65rem .75rem; border: 1px solid transparent; border-radius: var(--ds-radius-sm, 8px 0 8px 0); background: transparent; color: var(--ds-color-on-surface, #e5e2e1); font: inherit; font-size: .88rem; cursor: pointer; text-align: left; }
.playlist-picker__option > .ti-playlist, .playlist-picker__add { color: var(--ds-color-primary, #2196f3); flex-shrink: 0; }
.playlist-picker__option:hover { border-color: color-mix(in srgb, var(--ds-color-primary, #2196f3) 40%, transparent); background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 8%, transparent); }
.playlist-picker__name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.playlist-picker__count { flex-shrink: 0; border-radius: 9999px; padding: .1rem .5rem; background: color-mix(in srgb, var(--ds-color-surface-variant, #353534) 70%, transparent); color: var(--ds-color-on-surface-variant, #bfc7d4); font-size: .72rem; }
.playlist-picker__empty { display: flex; flex-direction: column; align-items: center; gap: .5rem; margin: .25rem; padding: 1.6rem 1rem; border: 1px dashed var(--ds-color-outline-strong, rgba(255,255,255,.1)); border-radius: var(--ds-radius-md, 12px 0 12px 0); color: var(--ds-color-on-surface-variant, #bfc7d4); font-size: .85rem; text-align: center; }
.playlist-picker__footer { display: flex; justify-content: center; padding: .75rem 1.1rem; border-top: 1px solid var(--ds-color-outline, rgba(255,255,255,.05)); }
.playlist-picker__cancel { border: 0; border-radius: var(--ds-radius-sm, 8px 0 8px 0); padding: .4rem 1rem; background: transparent; color: var(--ds-color-on-surface-variant, #bfc7d4); font: inherit; font-size: .82rem; cursor: pointer; }
.playlist-picker-enter-active, .playlist-picker-leave-active { transition: opacity .25s ease; }
.playlist-picker-enter-active .playlist-picker__panel, .playlist-picker-leave-active .playlist-picker__panel { transition: transform .25s cubic-bezier(.2,.9,.3,1.2), opacity .25s ease; }
.playlist-picker-enter-from, .playlist-picker-leave-to { opacity: 0; }
.playlist-picker-enter-from .playlist-picker__panel, .playlist-picker-leave-to .playlist-picker__panel { transform: scale(.94) translateY(.75rem); opacity: 0; }
</style>
