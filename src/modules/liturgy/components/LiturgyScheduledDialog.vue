<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { getDesktopBridge } from '@shared/services/desktop-bridge'

import { useScheduledDialog } from '../composables/useScheduledDialog'
import {
  extractProvaiEVedeEpisodes,
  type ProvaiEpisode,
} from '../services/provai-e-vede-source'
import { importProvaiEVedeEpisodes } from '../services/provai-e-vede-import'
import { useScheduledStore } from '../stores/useScheduledStore'

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
const entryKind = ref<'music' | 'online_video'>('music')
const entryUrl = ref('')

// ── Baixar Provai e Vede ───────────────────────────────────
const pvEpisodes = ref<ProvaiEpisode[]>([])
const pvSelected = ref<Set<string>>(new Set())
const pvBusy = ref(false)
const pvProgress = ref('')

async function onFetchProvaiEVede() {
  if (pvBusy.value) return
  pvBusy.value = true
  pvProgress.value = ''
  try {
    // Desktop: fetch pelo main (sem CORS). Web: direto (a página envia CORS aberto).
    const bridge = getDesktopBridge()
    const pageUrl =
      'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-4o-trimestre'
    let html: string | null = null
    if (bridge?.workspace?.downloadToMedia) {
      // usa o mesmo canal IPC: baixa a página como "arquivo" temporário não funciona
      // para HTML — fazer fetch direto do renderer (downloads.adventistas.org envia
      // Access-Control-Allow-Origin: * para os assets; testado manualmente).
    }
    const resp = await fetch(pageUrl)
    html = resp.ok ? await resp.text() : null
    const eps = html ? extractProvaiEVedeEpisodes(html) : []
    pvEpisodes.value = eps
    pvSelected.value = new Set(eps.map((e) => e.dateISO))
    if (eps.length === 0) pvProgress.value = '—'
  } finally {
    pvBusy.value = false
  }
}

/** 1-CLICK: busca → ignora sábados passados → baixa os futuros → agenda. */
const pvOneClickBusy = ref(false)
const pvOneClickProgress = ref('')

async function onProvaiEVedeOneClick() {
  if (pvOneClickBusy.value) return
  pvOneClickBusy.value = true
  pvOneClickProgress.value = ''
  try {
    const pageUrl =
      'https://downloads.adventistas.org/pt/mordomia-crista/video/provai-e-vede-2026-4o-trimestre'
    const resp = await fetch(pageUrl)
    const html = resp.ok ? await resp.text() : null
    const all = html ? extractProvaiEVedeEpisodes(html) : []
    const todayISO = new Date().toISOString().slice(0, 10)
    const upcoming = all.filter((e) => e.dateISO >= todayISO)
    if (upcoming.length === 0) {
      pvOneClickProgress.value = t('liturgy.messages.scheduledPvNothing')
      return
    }

    const bridge = getDesktopBridge()
    const store = useScheduledStore()
    let done = 0
    const resolvePath = async (ep: ProvaiEpisode): Promise<string> => {
      pvOneClickProgress.value = t('liturgy.messages.scheduledPvDownloading', {
        done: done + 1,
        total: upcoming.length,
      })
      if (bridge?.workspace?.downloadToMedia) {
        const fileName = ep.url.split('/').pop() ?? `${ep.dateISO}.mp4`
        const local = await bridge.workspace.downloadToMedia(ep.url, fileName)
        done++
        return local ?? ''
      }
      done++
      return ''
    }
    const report = await importProvaiEVedeEpisodes(store, upcoming, resolvePath, {
      onlyUpcoming: true,
    })

    // Sem disco (web): converter as entradas pra online_video com a URL original.
    if (!bridge?.workspace?.downloadToMedia) {
      for (const ep of upcoming) {
        const entry = store.findOn(report.rotationId, ep.dateISO)
        if (entry && !entry.content?.filePath) {
          store.upsertItem({
            id: entry.id, categoryId: entry.categoryId, date: entry.date,
            name: entry.name, content: { kind: 'online_video', url: ep.url },
          })
        }
      }
    }
    pvOneClickProgress.value = t('liturgy.messages.scheduledPvDone', {
      created: report.created, skipped: report.skipped,
    })
  } finally {
    pvOneClickBusy.value = false
  }
}

async function onDownloadSelected() {
  if (pvBusy.value || pvSelected.value.size === 0) return
  pvBusy.value = true
  try {
    const bridge = getDesktopBridge()
    const store = useScheduledStore()
    const chosen = pvEpisodes.value.filter((e) => pvSelected.value.has(e.dateISO))
    let done = 0
    for (const ep of chosen) {
      pvProgress.value = `${done + 1}/${chosen.length}`
      let localPath: string | null = null
      if (bridge?.workspace?.downloadToMedia) {
        const fileName = ep.url.split('/').pop() ?? `${ep.dateISO}.mp4`
        localPath = await bridge.workspace.downloadToMedia(ep.url, fileName)
      }
      // Importa com o caminho local (desktop) — sem download disponível (web),
      // agenda como online_video com a URL original (fallback).
      importProvaiEVedeEpisodes(store, [ep], () => localPath ?? '')
      if (!localPath) {
        // web/sem bridge: guarda a URL como online_video em vez de file vazio
        const rotation = store.categories.find((c) => c.name === 'Provai e Vede')
        const entry = rotation ? store.findOn(rotation.id, ep.dateISO) : undefined
        if (entry) {
          store.upsertItem({
            id: entry.id,
            categoryId: entry.categoryId,
            date: entry.date,
            name: entry.name,
            content: { kind: 'online_video', url: ep.url },
          })
        }
      }
      done++
    }
    pvProgress.value = `${done} ✓`
    pvEpisodes.value = []
    pvSelected.value = new Set()
  } finally {
    pvBusy.value = false
  }
}

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

/** Caminho do FORM: usuário só preenche data + conteúdo. Rotação é opcional —
 * se não escolheu, vai pra "Provai e Vede" criada sob demanda. */
function onAddSong() {
  if (!entryDate.value) return
  const rotationId = activeRotationId.value ?? dlg.ensureDefaultRotation()
  if (entryKind.value === 'music') {
    const musicId = Number(entryMusicId.value)
    if (!Number.isInteger(musicId) || musicId < 1) return
    dlg.addEntry(rotationId, {
      dateISO: entryDate.value,
      content: { kind: 'music', musicId },
      name: entryName.value.trim() || `Hino ${musicId}`,
    })
    entryMusicId.value = ''
  } else {
    const url = entryUrl.value.trim()
    if (!url) return
    dlg.addEntry(rotationId, {
      dateISO: entryDate.value,
      content: { kind: 'online_video', url },
      name: entryName.value.trim() || 'Vídeo',
    })
    entryUrl.value = ''
  }
  entryName.value = ''
  // form fica aberto pra digitar a próxima data em sequência
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
  // Modo newbie: slot desconhecido cria a rotação com o nome do slot —
  // ninguém precisa saber o que é "mapear" pra importar um trimestre.
  const report = dlg.applyQuarterPaste(pasteText.value, {
    year,
    slotMapping: mapping,
    autoCreateSlots: true,
  })
  pasteReport.value = {
    created: report.created,
    unmapped: Array.from(new Set(report.unmappedSlots)),
    errors: report.errors.length,
  }
  if (report.created > 0) {
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
        <div class="scheduled-dialog__header">
          <h2 class="liturgy-dialog__title">
            {{ t('liturgy.messages.scheduledTitle') }}
          </h2>
          <button
            type="button"
            class="scheduled-dialog__btn"
            :disabled="pvOneClickBusy"
            style="flex-shrink: 0"
            @click="onProvaiEVedeOneClick"
          >
            {{ t('liturgy.messages.scheduledPvOneClick') }}
          </button>
          <button
            type="button"
            class="scheduled-dialog__close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
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
            <form
              class="scheduled-dialog__quick-add"
              @submit.prevent="onAddSong"
            >
                <input
                  v-model="entryDate"
                  type="date"
                  class="scheduled-dialog__input"
                  required
                >
                <select
                  v-model="entryKind"
                  class="scheduled-dialog__input"
                >
                  <option value="music">
                    {{ t('liturgy.types.music') }}
                  </option>
                  <option value="online_video">
                    {{ t('liturgy.types.online_video') }}
                  </option>
                </select>
                <input
                  v-if="entryKind === 'music'"
                  v-model="entryMusicId"
                  type="number"
                  min="1"
                  inputmode="numeric"
                  class="scheduled-dialog__input"
                  :placeholder="t('liturgy.messages.scheduledSongNumber')"
                  required
                >
                <input
                  v-else
                  v-model="entryUrl"
                  type="url"
                  class="scheduled-dialog__input"
                  placeholder="https://…"
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
                  v-if="activeRotation"
                  @click="activeRotationId = null"
                >
                  {{ t('liturgy.actions.cancel') }}
                </button>
              </form>
              <template v-if="activeRotation">
              <div class="scheduled-dialog__right-head">
                <strong>{{ activeRotation.name }}</strong>
              </div>
              <details class="scheduled-dialog__advanced">
                <summary>{{ t('liturgy.messages.scheduledMoreOptions') }}</summary>
                <button
                  type="button"
                  class="scheduled-dialog__btn scheduled-dialog__btn--ghost"
                  @click="onDuplicateQuarter"
                >
                  {{ t('liturgy.messages.scheduledDuplicateQuarter') }}
                </button>
                <button
                  type="button"
                  class="scheduled-dialog__btn scheduled-dialog__btn--ghost"
                  :disabled="pvBusy"
                  @click="onFetchProvaiEVede"
                >
                  {{ t('liturgy.messages.scheduledFetchProvai') }}
                </button>
              </details>
              <div
                v-if="pvEpisodes.length > 0"
                class="scheduled-dialog__pv"
              >
                <label
                  v-for="ep in pvEpisodes"
                  :key="ep.dateISO"
                  class="scheduled-dialog__pv-row"
                >
                  <input
                    v-model="pvSelected"
                    type="checkbox"
                    :value="ep.dateISO"
                  >
                  <span>{{ dateFmt(ep.dateISO) }} — {{ ep.title }}</span>
                </label>
                <button
                  type="button"
                  class="scheduled-dialog__btn"
                  :disabled="pvBusy || pvSelected.size === 0"
                  @click="onDownloadSelected"
                >
                  {{ t('liturgy.messages.scheduledDownloadSelected') }}
                </button>
              </div>
              <p
                v-if="pvProgress"
                class="scheduled-dialog__report"
              >
                {{ pvProgress }}
              </p>
            </template>
            <ul class="scheduled-dialog__entries">
              <li
                v-for="entry in dlg.entriesByDate.value"
                :key="entry.id"
                class="scheduled-dialog__entry"
              >
                <span class="scheduled-dialog__entry-date">{{ dateFmt(entry.date) }}</span>
                <span class="scheduled-dialog__entry-name">
                  {{ entry.name || `#${entry.content?.musicId ?? '?'}` }}
                </span>
                <span class="scheduled-dialog__entry-kind">{{ entry.rotationName }}</span>
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
                v-if="dlg.entriesByDate.value.length === 0"
                class="scheduled-dialog__empty"
              >
                {{ t('liturgy.messages.scheduledEmptyDate') }}
              </li>
            </ul>
          </section>
        </div>

        <!-- ── Aba colar trimestre ── -->
        <div
          v-else
          class="scheduled-dialog__paste"
        >
          <p class="liturgy-dialog__hint">
            {{ t('liturgy.messages.scheduledPasteHintSimple') }}
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


      </GlassCard>
    </div>
  </Teleport>
</template>

<style scoped>
.liturgy-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: color-mix(in srgb, #000 55%, transparent);
  backdrop-filter: blur(6px);
}

/* Cabeçalho do dialog: título + fechar, sem hint solto ocupando linha */
.scheduled-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.scheduled-dialog__header .liturgy-dialog__title {
  margin: 0;
}

.scheduled-dialog__close {
  min-width: 2.25rem;
  min-height: 2.25rem;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.scheduled-dialog__close:hover {
  background: color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
}

/* Tabs pill no estilo do design system (não botões quadrados cinza) */
.scheduled-dialog__tabs {
  display: inline-flex;
  gap: 0.25rem;
  margin: 0;
  padding: 0.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  width: fit-content;
}

.scheduled-dialog__tab {
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  opacity: 0.65;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
}

.scheduled-dialog__tab.is-active {
  opacity: 1;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #003258);
}

/* Painel: laterais com superfície sutil, sem "gaiola" de bordas duras */
.scheduled-dialog__panes {
  display: flex;
  gap: 0.9rem;
  min-height: 320px;
  max-height: 56vh;
}

.scheduled-dialog__left {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-surface, #fff) 45%, transparent);
}

.scheduled-dialog__rots {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.scheduled-dialog__rot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.55rem 0.7rem;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.9em;
}

.scheduled-dialog__rot:hover {
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
}

.scheduled-dialog__rot.is-active {
  background: color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  font-weight: 700;
}

.scheduled-dialog__rot-del {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
  font-size: 1em;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
}

.scheduled-dialog__rot-del:hover {
  opacity: 1;
  color: #ff6b6b;
  background: color-mix(in srgb, #ff6b6b 18%, transparent);
}

.scheduled-dialog__new-rot {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.scheduled-dialog__input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface, #fff) 55%, transparent);
  color: var(--ds-color-on-surface);
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  font: inherit;
  font-size: 0.875rem;
  color-scheme: dark;
}

.scheduled-dialog__input:focus {
  outline: 2px solid color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
  outline-offset: 1px;
}

/* Botões pill iguais aos demais dialogs */
.scheduled-dialog__btn {
  border: 0;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #003258);
  border-radius: 999px;
  padding: 0.5rem 1.05rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  min-height: 2.25rem;
}

.scheduled-dialog__btn:hover {
  filter: brightness(1.08);
}

.scheduled-dialog__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scheduled-dialog__btn--ghost {
  background: transparent;
  color: var(--ds-color-on-surface);
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
}

/* Grade do culto à direita: linhas com separador suave, datas tabulares */
.scheduled-dialog__right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.scheduled-dialog__right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.scheduled-dialog__right-head strong {
  font-size: 1rem;
}

.scheduled-dialog__quick-add {
  display: grid;
  grid-template-columns: 140px 150px 1fr auto auto;
  gap: 0.4rem;
  align-items: center;
  padding: 0.6rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-surface, #fff) 40%, transparent);
}

.scheduled-dialog__entries {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.scheduled-dialog__entry {
  display: grid;
  grid-template-columns: 96px 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.6rem;
  font-size: 0.9em;
}

.scheduled-dialog__entry + .scheduled-dialog__entry {
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 7%, transparent);
}

.scheduled-dialog__entry:hover {
  background: color-mix(in srgb, var(--ds-color-on-surface) 7%, transparent);
}

.scheduled-dialog__entry-date {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.scheduled-dialog__entry-kind {
  opacity: 0.55;
  font-size: 0.82em;
}

.scheduled-dialog__empty {
  opacity: 0.55;
  padding: 1.5rem 0.75rem;
  text-align: center;
}

.scheduled-dialog__empty--pad {
  padding: 3rem 0.75rem;
}

/* Aba colar: textarea com superfície própria, ações à direita */
.scheduled-dialog__paste {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.scheduled-dialog__textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface, #fff) 55%, transparent);
  color: var(--ds-color-on-surface);
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  padding: 0.75rem 0.9rem;
  font: ui-monospace, monospace;
  font-size: 0.85em;
  resize: vertical;
  color-scheme: dark;
}

.scheduled-dialog__paste-actions {
  display: flex;
  justify-content: flex-end;
}

.scheduled-dialog__unmapped {
  border: 1px dashed color-mix(in srgb, var(--ds-color-on-surface) 25%, transparent);
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.scheduled-dialog__unmapped-hint {
  margin: 0;
  font-size: 0.85em;
  opacity: 0.8;
}

.scheduled-dialog__slot-row {
  display: grid;
  grid-template-columns: 130px 1fr auto;
  gap: 0.5rem;
  align-items: center;
}

.scheduled-dialog__report {
  margin: 0;
  font-size: 0.85em;
  opacity: 0.8;
}

.scheduled-dialog__pv {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 180px;
  overflow-y: auto;
  padding: 0.5rem;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-surface, #fff) 40%, transparent);
}

.scheduled-dialog__pv-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85em;
  cursor: pointer;
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
</style>
