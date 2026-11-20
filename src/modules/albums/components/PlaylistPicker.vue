<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Playlist, PlaylistItem } from '../services/playlist-storage'
defineProps<{ playlistItem: PlaylistItem | null; playlists: Playlist[] }>()
const emit = defineEmits<{ choose: [id: string]; close: [] }>()
const { t } = useI18n()
function closePlaylistPicker() { emit('close') }
function addToPlaylist(id: string) { emit('choose', id) }
</script>

<template>
    <Teleport to="body">
      <Transition name="playlist-picker">
        <div
          v-if="playlistItem"
          class="playlist-picker"
          role="dialog"
          aria-modal="true"
          :aria-label="t('common.addToPlaylist')"
          @click.self="closePlaylistPicker"
          @keydown.esc="closePlaylistPicker"
        >
          <div class="playlist-picker__panel">
            <header class="playlist-picker__header">
              <div class="playlist-picker__track">
                <span class="playlist-picker__track-icon">
                  <i class="ti ti-music" aria-hidden="true" />
                </span>
                <div class="playlist-picker__track-info">
                  <small>{{ t('common.addToPlaylist') }}</small>
                  <strong>{{ playlistItem.title }}</strong>
                </div>
              </div>
              <button
                type="button"
                class="playlist-picker__close"
                :aria-label="t('common.close')"
                @click="closePlaylistPicker"
              >
                <i class="ti ti-x" aria-hidden="true" />
              </button>
            </header>

            <div class="playlist-picker__body">
              <p v-if="playlists.length === 0" class="playlist-picker__empty">
                <i class="ti ti-music-plus" aria-hidden="true" />
                Você ainda não tem playlists.<br>
                Crie uma na seção Playlists da Biblioteca.
              </p>
              <button
                v-for="playlist in playlists"
                :key="playlist.id"
                type="button"
                class="playlist-picker__option"
                @click="addToPlaylist(playlist.id)"
              >
                <i class="ti ti-playlist" aria-hidden="true" />
                <span class="playlist-picker__name">{{ playlist.name }}</span>
                <small class="playlist-picker__count">{{ playlist.items.length }}</small>
                <i class="ti ti-plus playlist-picker__add" aria-hidden="true" />
              </button>
            </div>

            <footer class="playlist-picker__footer">
              <button type="button" class="playlist-picker__cancel" @click="closePlaylistPicker">
                Cancelar
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
</template>
<style scoped lang="scss">
.playlist-picker {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(4px);
}

.playlist-picker__panel {
  display: flex;
  flex-direction: column;
  width: min(26rem, calc(100vw - 2rem));
  max-height: min(30rem, calc(100vh - 4rem));
  border: 1px solid var(--ds-color-outline-strong, rgba(255, 255, 255, 0.10));
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: var(--ds-color-surface-card, #242424);
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
  overflow: hidden;
}

.playlist-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.05));
  background: color-mix(in srgb, var(--ds-color-surface-container, #201f1f) 70%, transparent);
}

.playlist-picker__track {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.playlist-picker__track-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 18%, transparent);
  color: var(--ds-color-primary, #2196f3);
  font-size: 1.1rem;
}

.playlist-picker__track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.playlist-picker__track-info small {
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.playlist-picker__track-info strong {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ds-color-on-surface, #e5e2e1);
}

.playlist-picker__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.playlist-picker__close:hover {
  background: var(--ds-color-surface-variant, #353534);
  color: var(--ds-color-on-surface, #e5e2e1);
}

.playlist-picker__body {
  flex: 1;
  overflow-y: auto;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.playlist-picker__option {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: transparent;
  color: var(--ds-color-on-surface, #e5e2e1);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.playlist-picker__option > .ti-playlist {
  color: var(--ds-color-primary, #2196f3);
  flex-shrink: 0;
}
.playlist-picker__option:hover {
  border-color: color-mix(in srgb, var(--ds-color-primary, #2196f3) 40%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary, #2196f3) 8%, transparent);
}

.playlist-picker__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-picker__count {
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.72rem;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-surface-variant, #353534) 70%, transparent);
  flex-shrink: 0;
}

.playlist-picker__add {
  font-size: 0.8rem;
  color: var(--ds-color-primary, #2196f3);
  opacity: 0;
  transform: translateX(-0.25rem);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.playlist-picker__option:hover .playlist-picker__add {
  opacity: 1;
  transform: translateX(0);
}

.playlist-picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.6rem 1rem;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font-size: 0.85rem;
  text-align: center;
  border: 1px dashed var(--ds-color-outline-strong, rgba(255, 255, 255, 0.10));
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  margin: 0.25rem;
}
.playlist-picker__empty .ti { font-size: 1.4rem; }

.playlist-picker__footer {
  padding: 0.75rem 1.1rem;
  border-top: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.05));
  display: flex;
  justify-content: center;
}

.playlist-picker__cancel {
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant, #bfc7d4);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  padding: 0.4rem 1rem;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  transition: color 0.2s ease;
}
.playlist-picker__cancel:hover {
  color: var(--ds-color-on-surface, #e5e2e1);
}

/* Transição do modal: fade + escala suave */
.playlist-picker-enter-active,
.playlist-picker-leave-active {
  transition: opacity 0.25s ease;
}
.playlist-picker-enter-active .playlist-picker__panel,
.playlist-picker-leave-active .playlist-picker__panel {
  transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.25s ease;
}
.playlist-picker-enter-from,
.playlist-picker-leave-to {
  opacity: 0;
}
.playlist-picker-enter-from .playlist-picker__panel,
.playlist-picker-leave-to .playlist-picker__panel {
  transform: scale(0.94) translateY(0.75rem);
  opacity: 0;
}

/* Toast de feedback */

</style>
