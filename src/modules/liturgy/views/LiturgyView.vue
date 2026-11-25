<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AlbumLyricDialog from '@modules/albums/components/AlbumLyricDialog.vue'

import { useLiturgyAppearanceStore } from '../stores/useLiturgyAppearanceStore'
import AppConfirm from '@shared/components/AppConfirm.vue'
import LiturgyAppearanceButton from '../components/LiturgyAppearanceButton.vue'
import { useLiturgyTransfer } from '../composables/useLiturgyTransfer'
import LiturgyCloneDialog from '../components/LiturgyCloneDialog.vue'
import LiturgyScheduledDialog from '../components/LiturgyScheduledDialog.vue'
import { useScheduledStore } from '../stores/useScheduledStore'
import { resolveScheduledEntry } from '../services/scheduled-resolver'
import { activeDateISO } from '../services/liturgy-preferences'
import LiturgyCustomBar from '../components/LiturgyCustomBar.vue'
import LiturgyCustomDialog from '../components/LiturgyCustomDialog.vue'
import LiturgyDayTabs from '../components/LiturgyDayTabs.vue'
import LiturgyItemDialog from '../components/LiturgyItemDialog.vue'
import LiturgySidebar from '../components/LiturgySidebar.vue'
import LiturgyTimeline from '../components/LiturgyTimeline.vue'
import { useLiturgy } from '../composables/useLiturgy'
import { useLiturgyVideoPrefetch } from '../composables/useLiturgyVideoPrefetch'

const scheduledDialogOpen = ref(false)

// Placeholder agendado → entrada do dia (badge na timeline).
const scheduledStore = useScheduledStore()
const appearanceStore = useLiturgyAppearanceStore()
const scheduledResolvedByItemId = computed(() => {
  const map: Record<
    string,
    | { entryName: string; kindLabel: string; kind: string; filePath?: string }
    | { empty: string }
  > = {}
  const day = selectedDay.value as import('../types/liturgy').LiturgyDayKey
  const dateISO = activeDateISO(day)
  for (const item of currentItems.value) {
    if (item.type !== 'scheduled') continue
    const rotationId =
      item.scheduledRotationId?.trim() || item.categoryId?.trim()
    if (!rotationId) continue
    const rotationName = scheduledStore.categoryName(rotationId)
    const resolved = resolveScheduledEntry(
      rotationId,
      dateISO,
      scheduledStore.categories,
      scheduledStore.items,
    )
    if (resolved) {
      map[item.id] = {
        entryName: `${rotationName}: ${resolved.entryName}`,
        kindLabel: t(`liturgy.messages.scheduledKind.${resolved.kind}`),
        kind: resolved.kind,
        filePath:
          resolved.content?.kind === 'file'
            ? resolved.content.filePath
            : undefined,
      }
    } else {
      // Sem entrada na data: dizer QUAL data e QUAL rotação — ponteiro cego não.
      map[item.id] = {
        empty: t('liturgy.messages.scheduledEmptyForDate', {
          date: dateISO.split('-').reverse().join('/'),
          rotation: rotationName ?? '—',
        }),
      }
    }
  }
  return map
})

const { t } = useI18n()

const {
  selectedDay,
  selectedCustomIndex,
  selectedItemIndex,
  siteProjectionItemId,
  customLiturgies,
  lastActionMessageKey,
  itemDialogOpen,
  editingIndex,
  itemDialogLockedCategory,
  itemDialogHideTypePicker,
  itemDraft,
  customDialogOpen,
  newCustomName,
  currentItems,
  currentNotes,
  isDraftValid,
  categoryOptions,
  complementaryTitleSuggestions,
  musicSearchQuery,
  filteredMusic,
  selectedMusic,
  musicCatalogEmpty,
  musicInstrumentalById,
  busyMusicId,
  lyricOpen,
  lyricDoc,
  isLoadingLyric,
  startLabels,
  durationLabels,
  videoProjectionItemId,
  currentClock,
  estimatedSessionEndLabel,
  remainingCountdownLabel,
  startTimeInput,
  endTimeInput,
  countdownExpired,
  countdownRunning,
  canStartCountdown,
  canCloneLiturgy,
  cloneDialogOpen,
  cloneSourceKey,
  cloneSources,
  deletionLocked,
  selectDay,
  selectCustomLiturgy,
  setSessionStartFromInput,
  clearSessionStart,
  setSessionEndFromInput,
  clearSessionEnd,
  startCountdown,
  stopCountdown,
  openAddDialog,
  openAddSubItemDialog,
  openEditDialog,
  closeItemDialog,
  saveItemDraft,
  setItemPlayer,
  confirmRemoveItem,
  confirmClearLiturgy,
  exportLiturgy,
  importLiturgy,
  hasLiturgyContent,
  setActionMessage,
  reorderItems,
  selectItem,
  playItemOnScreens,
  importJa,
  importScheduled,
  toggleItemDone,
  openCustomDialog,
  closeCustomDialog,
  createCustomLiturgy,
  confirmRemoveCustom,
  openCloneDialog,
  closeCloneDialog,
  cloneLiturgyFromSelected,
  toggleDeletionLock,
  clearActionMessage,
  setNotes,
  onManageTeam,
  onMusicPick,
  clearMusicPick,
  refreshMusicCatalog,
  onVideoFileSelected,
  onMusicSung,
  onMusicInstrumental,
  onMusicSlides,
  onMusicLyric,
  onPlaylistPlay,
  onPlaylistInstrumental,
  onPlaylistNoAudio,
  onPlaylistShuffle,
  closeLyric,
  setItemDraft,
  setMusicSearchQuery,
} = useLiturgy()

const { statusByItemId: offlineStatusByItemId } = useLiturgyVideoPrefetch()

/** Exibe avisos da liturgia e do player (ex.: áudio indisponível). */
const liturgyAlertKey = computed(() => lastActionMessageKey.value || null)

/* ---------- Exportar / importar a liturgia da semana ---------- */
const transfer = useLiturgyTransfer({
  exportLiturgy: () => exportLiturgy(),
  importLiturgy: (data, mode) => importLiturgy(data, mode),
  hasContent: () => hasLiturgyContent(),
})
const transferConfirmOpen = transfer.confirmOpen
const transferInput = ref<HTMLInputElement | null>(null)
watch(transfer.messageKey, (key) => {
  if (key) setActionMessage(key)
})

function onTransferFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void transfer.importFile(file)
}

/** app#331 RF-1: pós-import .slja — recarrega o catálogo pra música aparecer
 * na busca antes de o diálogo selecionar o novo ID. */
async function onSljaImported(): Promise<void> {
  await refreshMusicCatalog()
}
</script>

<template>
  <section class="liturgy-view">
    <header class="liturgy-view__header">
      <div class="liturgy-view__header-start">
        <LiturgyAppearanceButton />
      </div>
      <div class="liturgy-view__brand">
        <i
          class="ti ti-clipboard-text liturgy-view__brand-icon"
          aria-hidden="true"
        />
        <h1 class="liturgy-view__title">
          {{ t('liturgy.title') }}
        </h1>
      </div>

      <div class="liturgy-view__header-actions">
            <button
              type="button"
              class="liturgy-view__clear"
              :title="t('liturgy.importJa')"
              @click="importJa"
            >
              <i
                class="ti ti-file-import"
                aria-hidden="true"
              />
              <span>{{ t('liturgy.importJa') }}</span>
            </button>

            <button
              type="button"
              class="liturgy-view__clear"
              :title="t('liturgy.scheduled.import')"
              @click="importScheduled"
            >
              <i
                class="ti ti-calendar-down"
                aria-hidden="true"
              />
              <span>{{ t('liturgy.scheduled.import') }}</span>
            </button>

            <button
              type="button"
              class="liturgy-view__clear"
              :title="t('liturgy.messages.scheduledTitle')"
              @click="scheduledDialogOpen = true"
            >
              <i
                class="ti ti-calendar-time"
                aria-hidden="true"
              />
              <span>{{ t('liturgy.messages.scheduledTitle') }}</span>
            </button>

      </div>

      <div class="liturgy-view__meta">
        <div
          class="liturgy-view__transfer"
          role="group"
          :aria-label="t('liturgy.transfer.group')"
        >
          <button
            type="button"
            class="liturgy-view__clear"
            data-testid="liturgy-export"
            :title="t('liturgy.transfer.exportHint')"
            @click="transfer.exportFile()"
          >
            <i
              class="ti ti-file-export"
              aria-hidden="true"
            />
            <span>{{ t('liturgy.transfer.export') }}</span>
          </button>
          <button
            type="button"
            class="liturgy-view__clear"
            data-testid="liturgy-import"
            :title="t('liturgy.transfer.importHint')"
            @click="transferInput?.click()"
          >
            <i
              class="ti ti-file-download"
              aria-hidden="true"
            />
            <span>{{ t('liturgy.transfer.import') }}</span>
          </button>
          <input
            ref="transferInput"
            type="file"
            accept=".json,application/json"
            class="liturgy-view__transfer-input"
            data-testid="liturgy-import-input"
            @change="onTransferFile"
          >
        </div>
      </div>
    </header>

    <div
      v-if="liturgyAlertKey"
      class="liturgy-view__alert"
      role="status"
    >
      <p>{{ t(liturgyAlertKey) }}</p>
      <button
        type="button"
        @click="clearActionMessage"
      >
        {{ t('liturgy.actions.discard') }}
      </button>
    </div>

    <div class="liturgy-view__body">
      <LiturgySidebar
        :remaining-countdown="remainingCountdownLabel"
        :current-clock="currentClock"
        :estimated-session-end-label="estimatedSessionEndLabel"
        :countdown-expired="countdownExpired"
        :countdown-running="countdownRunning"
        :can-start-countdown="canStartCountdown"
        :start-time-input="startTimeInput"
        :end-time-input="endTimeInput"
        :notes="currentNotes"
        @update:notes="setNotes"
        @manage-team="onManageTeam"
        @set-start-from-input="setSessionStartFromInput"
        @clear-start="clearSessionStart"
        @set-end-from-input="setSessionEndFromInput"
        @clear-end="clearSessionEnd"
        @start-countdown="startCountdown"
        @stop-countdown="stopCountdown"
      />

      <div class="liturgy-view__main">
        <div class="liturgy-view__toolbar">
          <LiturgyDayTabs
            :selected-day="selectedDay"
            @select="selectDay"
          />

          <div class="liturgy-view__toolbar-actions">
            <button
              v-if="currentItems.length > 0"
              type="button"
              class="liturgy-view__lock"
              :class="{ 'liturgy-view__lock--active': deletionLocked }"
              :title="
                deletionLocked
                  ? t('liturgy.unlockDeletions')
                  : t('liturgy.lockDeletions')
              "
              :aria-label="
                deletionLocked
                  ? t('liturgy.unlockDeletions')
                  : t('liturgy.lockDeletions')
              "
              :aria-pressed="deletionLocked"
              @click="toggleDeletionLock"
            >
              <i
                class="ti"
                :class="deletionLocked ? 'ti-lock' : 'ti-lock-open'"
                aria-hidden="true"
              />
            </button>

            <button
              v-if="currentItems.length > 0"
              type="button"
              class="liturgy-view__clear"
              :disabled="deletionLocked"
              :title="t('liturgy.clearLiturgy')"
              @click="confirmClearLiturgy"
            >
              <i
                class="ti ti-trash"
                aria-hidden="true"
              />
              <span>{{ t('liturgy.clearLiturgy') }}</span>
            </button>

            <button
              type="button"
              class="liturgy-view__add"
              :title="t('liturgy.addItemToLiturgy')"
              @click="openAddDialog"
            >
              <i
                class="ti ti-plus"
                aria-hidden="true"
              />
              <span>{{ t('liturgy.addItem') }}</span>
            </button>
          </div>
        </div>

        <LiturgyCustomBar
          v-if="selectedDay === 'custom'"
          :liturgies="customLiturgies"
          :selected-index="selectedCustomIndex"
          @select="selectCustomLiturgy"
          @remove="confirmRemoveCustom"
          @create="openCustomDialog"
        />

        <LiturgyTimeline
          :items="currentItems"
          :selected-index="selectedItemIndex"
          :site-projection-item-id="siteProjectionItemId"
          :video-projection-item-id="videoProjectionItemId"
          :start-labels="startLabels"
          :duration-labels="durationLabels"
          :can-clone="canCloneLiturgy"
          :scheduled-resolved-by-item-id="scheduledResolvedByItemId"
          :deletion-locked="deletionLocked"
          :music-instrumental-by-id="musicInstrumentalById"
          :busy-music-id="busyMusicId"
          :offline-status-by-item-id="offlineStatusByItemId"
          :appearance="appearanceStore.appearance"
          @select="selectItem"
          @video-file-selected="onVideoFileSelected"
          @play-screens="playItemOnScreens"
          @edit="openEditDialog"
          @add-sub-item="openAddSubItemDialog"
          @remove="confirmRemoveItem"
          @toggle-done="toggleItemDone"
          @reorder="reorderItems"
          @clone="openCloneDialog"
          @music-sung="onMusicSung"
          @music-instrumental="onMusicInstrumental"
          @music-slides="onMusicSlides"
          @music-lyric="onMusicLyric"
          @playlist-play="onPlaylistPlay"
          @playlist-instrumental="onPlaylistInstrumental"
          @playlist-no-audio="onPlaylistNoAudio"
          @playlist-shuffle="onPlaylistShuffle"
          @set-player="setItemPlayer"
        />
      </div>
    </div>

    <LiturgyItemDialog
      :open="itemDialogOpen"
      :draft="itemDraft"
      :is-editing="editingIndex != null"
      :is-valid="isDraftValid"
      :lock-category="itemDialogLockedCategory"
      :hide-type-picker="itemDialogHideTypePicker"
      :category-options="categoryOptions"
      :complementary-title-suggestions="complementaryTitleSuggestions"
      :music-options="filteredMusic"
      :music-query="musicSearchQuery"
      :music-catalog-empty="musicCatalogEmpty"
      :selected-music="selectedMusic"
      @close="closeItemDialog"
      @save="saveItemDraft"
      @update:draft="setItemDraft"
      @update:music-query="setMusicSearchQuery"
      @pick-music="onMusicPick"
      @clear-music="clearMusicPick"
      :refresh-imported-catalog="onSljaImported"
    />

    <LiturgyCustomDialog
      :open="customDialogOpen"
      :name="newCustomName"
      @close="closeCustomDialog"
      @create="createCustomLiturgy"
      @update:name="newCustomName = $event"
    />

    <LiturgyCloneDialog
      :open="cloneDialogOpen"
      :sources="cloneSources"
      :source-key="cloneSourceKey"
      @close="closeCloneDialog"
      @confirm="cloneLiturgyFromSelected"
      @update:source-key="cloneSourceKey = $event"
    />

    <LiturgyScheduledDialog
      :open="scheduledDialogOpen"
      @close="scheduledDialogOpen = false"
    />

    <AlbumLyricDialog
      :open="lyricOpen"
      :loading="isLoadingLyric"
      :document="lyricDoc"
      @close="closeLyric"
    />
    <!-- Importar liturgia com a semana já preenchida: substituir ou acrescentar. -->
    <AppConfirm
      :open="transferConfirmOpen"
      :title="t('liturgy.transfer.confirmTitle')"
      :message="t('liturgy.transfer.confirmMessage')"
      :confirm-label="t('liturgy.transfer.replace')"
      :secondary-label="t('liturgy.transfer.append')"
      :cancel-label="t('common.cancel')"
      danger
      @confirm="transfer.confirm('replace')"
      @secondary="transfer.confirm('append')"
      @cancel="transfer.cancel()"
    />
  </section>
</template>

<style scoped lang="scss">
.liturgy-view {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 0;
  padding: 2rem;
  padding-bottom: 1.5rem;
  overflow: hidden;
}

.liturgy-view__header {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr) auto auto;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.liturgy-view__header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: .5rem;
}

.liturgy-view__header-start {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}

.liturgy-view__brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.liturgy-view__brand-icon {
  font-size: 1.85rem;
  line-height: 1;
  color: var(--ds-color-primary);
}

.liturgy-view__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--ds-color-on-surface);
}

.liturgy-view__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.liturgy-view__transfer {
  display: inline-flex;
  gap: 0.4rem;
}

.liturgy-view__transfer-input {
  display: none;
}

.liturgy-view__alert {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem 0 0.75rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-tertiary, #ffb77b) 35%, transparent);
  background: color-mix(in srgb, var(--ds-color-tertiary, #ffb77b) 12%, transparent);

  p {
    margin: 0;
    font-size: 0.875rem;
  }

  button {
    border: 0;
    background: transparent;
    color: inherit;
    font-weight: 700;
    cursor: pointer;
  }
}

.liturgy-view__body {
  display: flex;
  gap: 2rem;
  min-height: 0;
  flex: 1 1 auto;
  align-items: stretch;
  overflow: hidden;
}

.liturgy-view__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.liturgy-view__toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.liturgy-view__toolbar :deep(.liturgy-day-tabs) {
  flex: 1 1 auto;
  min-width: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}

.liturgy-view__toolbar-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}

.liturgy-view__lock {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: color-mix(in srgb, var(--ds-color-on-surface) 70%, transparent);
  cursor: pointer;
  transition:
    transform 140ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
    color: var(--ds-color-on-surface);
  }

  &:active {
    transform: scale(0.97);
  }

  i {
    font-size: 1.05rem;
  }

  &--active {
    border-color: color-mix(in srgb, var(--ds-color-tertiary, #ffb77b) 45%, transparent);
    background: color-mix(in srgb, var(--ds-color-tertiary, #ffb77b) 16%, transparent);
    color: var(--ds-color-tertiary, #ffb77b);
  }
}

.liturgy-view__clear {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-error, #ffb4ab) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 10%, transparent);
  color: var(--ds-color-error, #ffb4ab);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 140ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 18%, transparent);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  i {
    font-size: 0.95rem;
  }
}

.liturgy-view__add {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
  padding: 0.3rem 0.7rem;
  border: 0;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  transition:
    transform 140ms ease,
    filter 140ms ease;

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.97);
  }

  i {
    font-size: 0.95rem;
  }
}

.liturgy-view__body :deep(.liturgy-sidebar) {
  flex-shrink: 0;
  align-self: stretch;
  min-height: 0;
  height: auto;
  max-height: none;
  overflow-y: auto;
}

.liturgy-view__main :deep(.liturgy-custom-bar) {
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .liturgy-view {
    padding: 1.25rem;
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .liturgy-view__body {
    flex-direction: column;
    overflow: visible;
  }

  .liturgy-view__main {
    overflow: visible;
  }

}

@media (max-width: 1280px) {
  .liturgy-view {
    gap: 0.75rem;
    padding: 0.85rem 1rem 0.75rem;
  }

  .liturgy-view__header {
    grid-template-columns: 16rem minmax(0, 1fr) auto;
    column-gap: .85rem;
    row-gap: .75rem;
  }
  .liturgy-view__header-actions {
    grid-column: 2 / -1;
    grid-row: 2;
  }
  .liturgy-view__meta { grid-column: 3; grid-row: 1; }

  .liturgy-view__brand {
    gap: 0.55rem;
  }

  .liturgy-view__brand-icon {
    font-size: 1.35rem;
  }

  .liturgy-view__title {
    font-size: 1.05rem;
  }

  .liturgy-view__body {
    gap: 0.85rem;
  }

  .liturgy-view__main {
    gap: 0.55rem;
  }

  .liturgy-view__toolbar {
    gap: 0.45rem;
  }

  .liturgy-view__toolbar-actions {
    gap: 0.35rem;
  }

  .liturgy-view__lock {
    width: 1.75rem;
    height: 1.75rem;

    i {
      font-size: 0.9rem;
    }
  }

  .liturgy-view__clear,
  .liturgy-view__add {
    min-height: 1.75rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.68rem;

    i {
      font-size: 0.85rem;
    }
  }

  .liturgy-view__body :deep(.liturgy-sidebar) {
    max-width: 16rem;
  }

  .liturgy-view__body :deep(.ds-glass-card--padded) {
    padding: 0.75rem;
  }
}
@media (max-width: 960px) {
  .liturgy-view__header { display: flex; flex-wrap: wrap; }
  .liturgy-view__brand { margin-right: auto; }
  .liturgy-view__header-actions { justify-content: flex-start; }
}
</style>
