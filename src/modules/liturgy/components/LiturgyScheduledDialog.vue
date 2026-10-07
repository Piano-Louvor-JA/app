<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { useScheduledDialog } from '../composables/useScheduledDialog'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dlg = useScheduledDialog()

type TabId = 'rotations' | 'paste' | 'grade'
const tab = ref<TabId>('rotations')

// ── Rotações ───────────────────────────────────────────────
const activeRotationId = ref<string | null>(null)
const newRotationName = ref('')
const addEntryOpen = ref(false)
const entryDate = ref(new Date().toISOString().slice(0, 10))
const entryMusicId = ref('')
const entryName = ref('')

const activeRotation = computed(
  () => dlg.rotations.value.find((r) => r.id === activeRotationId.value) ?? null,
)
const activeEntries = computed(() =>
  activeRotationId.value ? dlg.entriesOf(activeRotationId.value) : [],
)

function onCreateRotation() {
  const name = newRotationName.value.trim()
  if (!name) return
  const id = dlg.createRotation(name)
  newRotationName.value = ''
  activeRotationId.value = id
  tab.value = 'rotations'
}

/** Caminho simples: data + número. Listas longas continuam na aba Colar trimestre. */
function onAddSong() {
  const musicId = Number(entryMusicId.value)
  if (!activeRotationId.value || !entryDate.value || !Number.isInteger(musicId) || musicId < 1) return
  dlg.addEntry(activeRotationId.value, {
    dateISO: entryDate.value,
    content: { kind: 'music', musicId },
    name: entryName.value.trim() || `Hino ${musicId}`,
  })
  entryMusicId.value = ''
  entryName.value = ''
  addEntryOpen.value = false
}

// ── Colar trimestre ────────────────────────────────────────
const pasteText = ref('')
const pasteReport = ref<{ created: number; unmapped: string[]; errors: number } | null>(null)

const slotChoices = ref<Record<string, string>>({})
const unmappedSlots = computed(() => Array.from(dlg.pendingSlots.value.keys()))

function onApplyPaste() {
  const mapping: Record<string, string | undefined> = {}
  for (const rot of dlg.rotations.value) {
    const key = rot.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    if (!(key in mapping)) mapping[key] = rot.id
  }
  for (const [slot, rotId] of Object.entries(slotChoices.value)) {
    if (rotId) mapping[slot] = rotId
  }
  const year = new Date().getFullYear()
  const report = dlg.applyQuarterPaste(pasteText.value, { year, slotMapping: mapping })
  pasteReport.value = {
    created: report.created,
    unmapped: Array.from(new Set(report.unmappedSlots)),
    errors: report.errors.length,
  }
  if (report.created > 0 && report.unmappedSlots.length === 0) {
    pasteText.value = ''
    tab.value = 'rotations'
  }
}

function onResolveSlot(slot: string) {
  const rotId = slotChoices.value[slot]
  if (!rotId) return
  dlg.applySlotMapping(slot, rotId)
}

// ── Duplicar trimestre ─────────────────────────────────────
function onDuplicateQuarter() {
  if (!activeRotationId.value || activeEntries.value.length === 0) return
  const first = activeEntries.value[0]!.date
  dlg.duplicateQuarter(activeRotationId.value, { fromDate: first, weeks: 4 })
}

const entryKindKey = (kind: string) => `liturgy.messages.scheduledKind.${kind}`
const dateFmt = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="liturgy-dialog-backdrop"
      @click.self="emit('close')"
    >
      <GlassCard
        class="liturgy-dialog scheduled-dialog"
        elevated
      >
        <h2 class="liturgy-dialog__title">
          {{ t('liturgy.messages.scheduledTitle') }}
        </h2>
        <p class="liturgy-dialog__hint">
          {{ t('liturgy.messages.scheduledHint') }}
        </p>

        <div
          class="scheduled-dialog__tabs"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'rotations'"
            class="scheduled-dialog__tab"
            :class="{ 'is-active': tab === 'rotations' }"
            @click="tab = 'rotations'"
          >
            {{ t('liturgy.messages.scheduledTitle') }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'paste'"
            class="scheduled-dialog__tab"
            :class="{ 'is-active': tab === 'paste' }"
            @click="tab = 'paste'"
          >
            {{ t('liturgy.messages.scheduledPasteQuarter') }}
          </button>
        </div>

        <!-- ── Aba rotações ── -->
        <div
          v-if="tab === 'rotations'"
          class="scheduled-dialog__panes"
        >
          <aside class="scheduled-dialog__left">
            <ul class="scheduled-dialog__rots">
              <li
                v-for="rot in dlg.rotations.value"
                :key="rot.id"
                class="scheduled-dialog__rot"
                :class="{ 'is-active': rot.id === activeRotationId }"
                @click="activeRotationId = rot.id"
              >
                {{ rot.name }}
                <button
                  type="button"
                  class="scheduled-dialog__rot-del"
                  :aria-label="t('liturgy.remove')"
                  @click.stop="dlg.removeRotation(rot.id)"
                >
                  ×
                </button>
              </li>
            </ul>
            <form
              class="scheduled-dialog__new-rot"
              @submit.prevent="onCreateRotation"
            >
              <input
                v-model="newRotationName"
                type="text"
                class="scheduled-dialog__input"
                :placeholder="t('liturgy.messages.scheduledRotationName')"
              >
              <button
                type="submit"
                class="scheduled-dialog__btn"
                :disabled="!newRotationName.trim()"
              >
                + {{ t('liturgy.messages.scheduledNewRotation') }}
              </button>
            </form>
          </aside>

          <section class="scheduled-dialog__right">
            <template v-if="activeRotation">
              <div class="scheduled-dialog__right-head">
                <strong>{{ activeRotation.name }}</strong>
                <button
                  type="button"
                  class="scheduled-dialog__btn"
                  @click="addEntryOpen = !addEntryOpen"
                >
                  + {{ t('liturgy.messages.scheduledAddSong') }}
                </button>
              </div>
              <form
                v-if="addEntryOpen"
                class="scheduled-dialog__quick-add"
                @submit.prevent="onAddSong"
              >
                <input
                  v-model="entryDate"
                  type="date"
                  class="scheduled-dialog__input"
                  required
                >
                <input
                  v-model="entryMusicId"
                  type="number"
                  min="1"
                  inputmode="numeric"
                  class="scheduled-dialog__input"
                  :placeholder="t('liturgy.messages.scheduledSongNumber')"
                  required
                >
                <input
                  v-model="entryName"
                  type="text"
                  class="scheduled-dialog__input"
                  :placeholder="t('liturgy.messages.scheduledSongName')"
                >
                <button
                  type="submit"
                  class="scheduled-dialog__btn"
                >
                  {{ t('liturgy.actions.save') }}
                </button>
                <button
                  type="button"
                  class="scheduled-dialog__btn scheduled-dialog__btn--ghost"
                  @click="addEntryOpen = false"
                >
                  {{ t('liturgy.actions.cancel') }}
                </button>
              </form>
              <details class="scheduled-dialog__advanced">
                <summary>{{ t('liturgy.messages.scheduledMoreOptions') }}</summary>
                <button
                  type="button"
                  class="scheduled-dialog__btn scheduled-dialog__btn--ghost"
                  @click="onDuplicateQuarter"
                >
                  {{ t('liturgy.messages.scheduledDuplicateQuarter') }}
                </button>
              </details>
              <ul class="scheduled-dialog__entries">
                <li
                  v-for="entry in activeEntries"
                  :key="entry.id"
                  class="scheduled-dialog__entry"
                >
                  <span class="scheduled-dialog__entry-date">{{ dateFmt(entry.date) }}</span>
                  <span class="scheduled-dialog__entry-name">
                    {{ entry.name || `#${entry.content?.musicId ?? '?'}` }}
                  </span>
                  <span
                    v-if="entry.content?.kind"
                    class="scheduled-dialog__entry-kind"
                  >
                    {{ t(entryKindKey(entry.content.kind)) }}
                  </span>
                  <button
                    type="button"
                    class="scheduled-dialog__rot-del"
                    :aria-label="t('liturgy.remove')"
                    @click="dlg.removeEntry(entry.id)"
                  >
                    ×
                  </button>
                </li>
                <li
                  v-if="activeEntries.length === 0"
                  class="scheduled-dialog__empty"
                >
                  {{ t('liturgy.messages.scheduledEmptyDate') }}
                </li>
              </ul>
            </template>
            <p
              v-else
              class="scheduled-dialog__empty scheduled-dialog__empty--pad"
            >
              {{ t('liturgy.messages.scheduledRotationName') }}
            </p>
          </section>
        </div>

        <!-- ── Aba colar trimestre ── -->
        <div
          v-else
          class="scheduled-dialog__paste"
        >
          <p class="liturgy-dialog__hint">
            {{ t('liturgy.messages.scheduledPasteHint') }}
          </p>
          <textarea
            v-model="pasteText"
            class="scheduled-dialog__textarea"
            rows="10"
            spellcheck="false"
          />
          <div class="scheduled-dialog__paste-actions">
            <button
              type="button"
              class="scheduled-dialog__btn"
              :disabled="!pasteText.trim()"
              @click="onApplyPaste"
            >
              {{ t('liturgy.messages.scheduledApplyPaste') }}
            </button>
          </div>

          <div
            v-if="unmappedSlots.length > 0"
            class="scheduled-dialog__unmapped"
          >
            <p class="scheduled-dialog__unmapped-hint">
              {{
                t('liturgy.messages.scheduledUnmapped', {
                  slots: unmappedSlots.join(', '),
                })
              }}
            </p>
            <div
              v-for="slot in unmappedSlots"
              :key="slot"
              class="scheduled-dialog__slot-row"
            >
              <code>{{ slot }}</code>
              <select
                v-model="slotChoices[slot]"
                class="scheduled-dialog__input"
              >
                <option
                  value=""
                  disabled
                >
                  —
                </option>
                <option
                  v-for="rot in dlg.rotations.value"
                  :key="rot.id"
                  :value="rot.id"
                >
                  {{ rot.name }}
                </option>
              </select>
              <button
                type="button"
                class="scheduled-dialog__btn"
                :disabled="!slotChoices[slot]"
                @click="onResolveSlot(slot)"
              >
                ✓
              </button>
            </div>
          </div>

          <p
            v-if="pasteReport"
            class="scheduled-dialog__report"
          >
            {{ pasteReport.created }} ✓
            <span
              v-if="pasteReport.unmapped.length"
            >· {{ pasteReport.unmapped.join(', ') }}</span>
            <span v-if="pasteReport.errors">· {{ pasteReport.errors }} ✗</span>
          </p>
        </div>

        <div class="liturgy-dialog__actions">
          <button
            type="button"
            class="liturgy-dialog__btn liturgy-dialog__btn--primary"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
        </div>
      </GlassCard>
    </div>
  </Teleport>
</template>

<style scoped>
.scheduled-dialog {
  width: min(860px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}

.scheduled-dialog__tabs {
  display: flex;
  gap: 4px;
  margin: 12px 0;
}

.scheduled-dialog__tab {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  opacity: 0.65;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.scheduled-dialog__tab.is-active {
  opacity: 1;
  border-color: var(--ds-border, rgba(128, 128, 128, 0.35));
  background: rgba(128, 128, 128, 0.12);
}

.scheduled-dialog__panes {
  display: flex;
  gap: 14px;
  min-height: 320px;
  max-height: 54vh;
}

.scheduled-dialog__left {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scheduled-dialog__rots {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scheduled-dialog__rot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.92em;
}

.scheduled-dialog__rot:hover {
  background: rgba(128, 128, 128, 0.14);
}

.scheduled-dialog__rot.is-active {
  background: rgba(128, 128, 128, 0.22);
}

.scheduled-dialog__rot-del {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
  font-size: 1em;
  line-height: 1;
  padding: 2px 4px;
}

.scheduled-dialog__rot-del:hover {
  opacity: 1;
  color: #ff6b6b;
}

.scheduled-dialog__new-rot {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scheduled-dialog__input {
  width: 100%;
  border: 1px solid var(--ds-border, rgba(128, 128, 128, 0.35));
  background: transparent;
  color: inherit;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  font-size: 0.9em;
}

.scheduled-dialog__btn {
  border: 1px solid var(--ds-border, rgba(128, 128, 128, 0.35));
  background: transparent;
  color: inherit;
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font: inherit;
  font-size: 0.9em;
}

.scheduled-dialog__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scheduled-dialog__btn--ghost {
  border-color: transparent;
  opacity: 0.75;
}

.scheduled-dialog__right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scheduled-dialog__right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.scheduled-dialog__quick-add {
  display: grid;
  grid-template-columns: 132px 120px 1fr auto auto;
  gap: 6px;
  align-items: center;
}

.scheduled-dialog__advanced {
  font-size: 0.85em;
  opacity: 0.78;
}

.scheduled-dialog__advanced summary {
  cursor: pointer;
  width: fit-content;
}

.scheduled-dialog__advanced .scheduled-dialog__btn {
  margin-top: 6px;
}

.scheduled-dialog__entries {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.scheduled-dialog__entry {
  display: grid;
  grid-template-columns: 92px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.9em;
}

.scheduled-dialog__entry:hover {
  background: rgba(128, 128, 128, 0.1);
}

.scheduled-dialog__entry-date {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.scheduled-dialog__entry-kind {
  opacity: 0.55;
  font-size: 0.85em;
}

.scheduled-dialog__empty {
  opacity: 0.55;
  padding: 10px;
  text-align: center;
}

.scheduled-dialog__empty--pad {
  padding: 40px 10px;
}

.scheduled-dialog__paste {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scheduled-dialog__textarea {
  width: 100%;
  border: 1px solid var(--ds-border, rgba(128, 128, 128, 0.35));
  background: transparent;
  color: inherit;
  border-radius: 8px;
  padding: 10px;
  font: ui-monospace, monospace;
  font-size: 0.85em;
  resize: vertical;
}

.scheduled-dialog__paste-actions {
  display: flex;
  justify-content: flex-end;
}

.scheduled-dialog__unmapped {
  border: 1px dashed var(--ds-border, rgba(128, 128, 128, 0.4));
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scheduled-dialog__unmapped-hint {
  margin: 0;
  font-size: 0.88em;
  opacity: 0.8;
}

.scheduled-dialog__slot-row {
  display: grid;
  grid-template-columns: 130px 1fr auto;
  gap: 8px;
  align-items: center;
}

.scheduled-dialog__report {
  margin: 0;
  font-size: 0.88em;
  opacity: 0.8;
}
</style>
