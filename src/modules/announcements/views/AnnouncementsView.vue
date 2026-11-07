<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAnnotationProjection } from '@modules/liturgy/services/annotation-projection'
import IndependentProjectionButton from '@shared/components/IndependentProjectionButton.vue'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

import AnnouncementEditorDialog from '../components/AnnouncementEditorDialog.vue'
import AnnouncementListBar from '../components/AnnouncementListBar.vue'
import AnnouncementNameDialog from '../components/AnnouncementNameDialog.vue'
import AnnouncementRow from '../components/AnnouncementRow.vue'
import AnnouncementsCarouselStage from '../components/AnnouncementsCarouselStage.vue'
import { newAnnouncementDraft, useAnnouncements } from '../composables/useAnnouncements'
import { useAnnouncementsCarousel } from '../composables/useAnnouncementsCarousel'
import { announcementFiles, resolveAnnouncementFiles } from '../services/announcements-files'
import { projectAnnouncement } from '../services/announcements-projection'
import { CAROUSEL_PROJECTION_MODULE } from '../services/carousel-runtime'
import {
  ANNOUNCEMENT_KINDS,
  CAROUSEL_SLIDE_MS_MAX,
  CAROUSEL_SLIDE_MS_MIN,
  isInCarousel,
  type Announcement,
  type AnnouncementKind,
} from '../types/announcements'

const { t } = useI18n()
const router = useRouter()

const { minimize, prepare } = useMinimizablePage({
  describe: () => ({ title: t('announcements.title'), icon: 'ti-speakerphone', summary: '' }),
  capture: () => null,
  fallbackRoute: { name: 'utilities' },
})

const ui = useAnnouncements()
const { lists, activeList, activeListId, notice } = ui
const carousel = useAnnouncementsCarousel()
const { projectingItemId } = useAnnotationProjection()

const KIND_ICONS: Record<AnnouncementKind, string> = {
  text: 'ti-align-left',
  images: 'ti-photo',
  video: 'ti-video',
  presentation: 'ti-presentation',
  url: 'ti-link',
}

// ── aviso de feedback (some sozinho) ─────────────────────────────
let noticeTimer: ReturnType<typeof setTimeout> | null = null
watch(notice, (value) => {
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = value ? setTimeout(() => ui.clearNotice(), 7000) : null
})
onUnmounted(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
})

// ── arquivos ausentes (RF-10) ────────────────────────────────────
const missingIds = ref<Set<string>>(new Set())
async function refreshMissing(items: Announcement[]) {
  const next = new Set<string>()
  for (const item of items) {
    if (announcementFiles(item).length === 0) continue
    const { missing } = await resolveAnnouncementFiles(item)
    if (missing.length > 0) next.add(item.id)
  }
  missingIds.value = next
}
watch(() => activeList.value.items, (items) => void refreshMissing(items), { immediate: true })

// ── editor ───────────────────────────────────────────────────────
const editing = ref<{ item: Announcement; isNew: boolean } | null>(null)

function openNew(kind: AnnouncementKind) {
  editing.value = { item: newAnnouncementDraft(kind), isNew: true }
}

function openEdit(item: Announcement) {
  editing.value = { item, isNew: false }
}

function onEditorSave(item: Announcement) {
  ui.saveAnnouncement(item)
  editing.value = null
}

// ── listas ───────────────────────────────────────────────────────
const nameDialog = ref<{ mode: 'create' | 'rename' } | null>(null)
const nameDialogTitle = computed(() =>
  nameDialog.value?.mode === 'rename' ? t('announcements.lists.rename') : t('announcements.lists.newTitle'),
)

function onNameSave(name: string) {
  if (nameDialog.value?.mode === 'rename') ui.renameActiveList(name)
  else ui.createList(name)
  nameDialog.value = null
}

// ── projeção ─────────────────────────────────────────────────────
async function onProject(item: Announcement) {
  if (carousel.isActive.value) carousel.stop()
  const result = await projectAnnouncement(item, router)
  if (!result.ok) ui.notify(result.key, 'error', result.params)
}

// ── carrossel ────────────────────────────────────────────────────
const carouselSeconds = computed(() => Math.round(ui.carousel.value.slideMs / 1000))
const skippedCount = computed(() => activeList.value.items.filter((item) => !isInCarousel(item)).length)
const helpOpen = ref(false)

function onSecondsInput(event: Event) {
  const seconds = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(seconds) || seconds <= 0) return
  ui.setCarousel({ slideMs: seconds * 1000 })
  carousel.setSlideMs(ui.carousel.value.slideMs)
}

function onLoopChange(event: Event) {
  const loop = (event.target as HTMLInputElement).checked
  ui.setCarousel({ loop })
  carousel.setLoop(loop)
}

async function onCarouselStart() {
  const started = await carousel.start(activeList.value.items, ui.carousel.value)
  if (!started) ui.notify('announcements.carousel.empty', 'error')
}

/** Botão Sobrepor/Compartilhar: parado, o carrossel começa só na projeção independente. */
async function prepareCarouselIndependent(): Promise<boolean> {
  const ready = await carousel.prepareIndependent(activeList.value.items, ui.carousel.value)
  if (!ready) ui.notify('announcements.carousel.empty', 'error')
  return ready
}

function onCarouselToggle() {
  if (carousel.status.value === 'playing') carousel.pause()
  else carousel.resume()
}

// trocar de lista para o carrossel: os slides eram da lista anterior
watch(activeListId, () => {
  if (carousel.isActive.value) carousel.stop()
})

function goBack() {
  void router.push({ name: 'utilities' })
}
</script>

<template>
  <section class="announcements-view">
    <header class="announcements-view__header">
      <PageBackStack
        @minimize="minimize"
        @prepare="prepare"
      >
        <button
          type="button"
          class="announcements-view__back"
          :aria-label="t('announcements.back')"
          @click="goBack"
        >
          <i
            class="ti ti-arrow-left"
            aria-hidden="true"
          />
        </button>
      </PageBackStack>
      <div class="announcements-view__brand">
        <div class="announcements-view__brand-icon">
          <i
            class="ti ti-speakerphone"
            aria-hidden="true"
          />
        </div>
        <h1 class="announcements-view__title">
          {{ t('announcements.title') }}
        </h1>
      </div>
    </header>

    <div
      v-if="notice"
      class="announcements-view__notice"
      :class="`announcements-view__notice--${notice.tone}`"
      role="status"
      data-test="notice"
    >
      <span>{{ t(notice.key, notice.params ?? {}) }}</span>
      <button
        type="button"
        :aria-label="t('announcements.notices.close')"
        @click="ui.clearNotice()"
      >
        <i
          class="ti ti-x"
          aria-hidden="true"
        />
      </button>
    </div>

    <div class="announcements-view__content">
      <div class="announcements-view__main">
        <AnnouncementListBar
          :lists="lists"
          :active-list-id="activeListId"
          @select="ui.setActiveList"
          @create="nameDialog = { mode: 'create' }"
          @rename="nameDialog = { mode: 'rename' }"
          @duplicate="ui.duplicateActiveList()"
          @remove="ui.confirmRemoveActiveList()"
        />

        <div
          class="announcements-view__add"
          role="group"
          :aria-label="t('announcements.add')"
        >
          <span class="announcements-view__add-label">{{ t('announcements.add') }}</span>
          <button
            v-for="kind in ANNOUNCEMENT_KINDS"
            :key="kind"
            type="button"
            class="announcements-view__add-btn"
            :title="t(`announcements.kindHints.${kind}`)"
            :data-test="`add-${kind}`"
            @click="openNew(kind)"
          >
            <i
              class="ti"
              :class="KIND_ICONS[kind]"
              aria-hidden="true"
            />
            {{ t(`announcements.kinds.${kind}`) }}
          </button>
        </div>

        <ol
          v-if="activeList.items.length > 0"
          class="announcements-view__list"
        >
          <AnnouncementRow
            v-for="(item, index) in activeList.items"
            :key="item.id"
            :item="item"
            :index="index"
            :total="activeList.items.length"
            :projecting="item.kind === 'text' && projectingItemId === item.id"
            :missing="missingIds.has(item.id)"
            @project="onProject(item)"
            @edit="openEdit(item)"
            @toggle-carousel="(on) => ui.setInCarousel(item.id, on)"
            @duplicate="ui.duplicateAnnouncement(item.id)"
            @remove="ui.confirmRemoveAnnouncement(item.id)"
            @move="ui.moveAnnouncement"
          />
        </ol>
        <div
          v-else
          class="announcements-view__empty"
          data-test="empty"
        >
          <i
            class="ti ti-speakerphone"
            aria-hidden="true"
          />
          <p class="announcements-view__empty-title">
            {{ t('announcements.empty') }}
          </p>
          <p>{{ t('announcements.emptyHint') }}</p>
        </div>
      </div>

      <aside
        class="announcements-view__carousel"
        :aria-label="t('announcements.carousel.title')"
      >
        <div class="announcements-view__carousel-head">
          <h2 class="announcements-view__carousel-title">
            {{ t('announcements.carousel.title') }}
          </h2>
          <button
            type="button"
            class="announcements-view__help"
            :class="{ 'is-open': helpOpen }"
            :title="t('announcements.carousel.help.button')"
            :aria-label="t('announcements.carousel.help.button')"
            :aria-expanded="helpOpen ? 'true' : 'false'"
            aria-controls="carousel-help"
            data-test="carousel-help"
            @click="helpOpen = !helpOpen"
          >
            <i
              class="ti ti-help-circle"
              aria-hidden="true"
            />
          </button>
        </div>
        <div
          v-if="helpOpen"
          id="carousel-help"
          class="announcements-view__help-box"
          data-test="carousel-help-box"
        >
          <p>{{ t('announcements.carousel.help.what') }}</p>
          <ul>
            <li>{{ t('announcements.carousel.help.which') }}</li>
            <li>{{ t('announcements.carousel.help.toggle') }}</li>
            <li>{{ t('announcements.carousel.help.timing') }}</li>
            <li>{{ t('announcements.carousel.help.where') }}</li>
            <li>{{ t('announcements.carousel.help.independent') }}</li>
          </ul>
        </div>
        <div class="announcements-view__preview">
          <AnnouncementsCarouselStage
            v-if="carousel.isActive.value"
            embedded
          />
          <i
            v-else
            class="ti ti-slideshow"
            aria-hidden="true"
          />
        </div>

        <p
          v-if="carousel.isActive.value"
          class="announcements-view__position"
          data-test="carousel-position"
        >
          {{ t('announcements.carousel.position', { current: carousel.index.value + 1, total: carousel.total.value }) }}
        </p>

        <button
          v-if="!carousel.isActive.value"
          type="button"
          class="announcements-view__carousel-start"
          data-test="carousel-start"
          @click="onCarouselStart"
        >
          <i
            class="ti ti-player-play"
            aria-hidden="true"
          />
          {{ t('announcements.carousel.start') }}
        </button>
        <div
          v-else
          class="announcements-view__carousel-controls"
        >
          <button
            type="button"
            :aria-label="t('announcements.carousel.prev')"
            :title="t('announcements.carousel.prev')"
            data-test="carousel-prev"
            @click="carousel.prev()"
          >
            <i
              class="ti ti-player-skip-back"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            :aria-label="carousel.status.value === 'playing' ? t('announcements.carousel.pause') : t('announcements.carousel.resume')"
            :title="carousel.status.value === 'playing' ? t('announcements.carousel.pause') : t('announcements.carousel.resume')"
            data-test="carousel-toggle"
            @click="onCarouselToggle"
          >
            <i
              class="ti"
              :class="carousel.status.value === 'playing' ? 'ti-player-pause' : 'ti-player-play'"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            :aria-label="t('announcements.carousel.next')"
            :title="t('announcements.carousel.next')"
            data-test="carousel-next"
            @click="carousel.next()"
          >
            <i
              class="ti ti-player-skip-forward"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="is-danger"
            :aria-label="t('announcements.carousel.stop')"
            :title="t('announcements.carousel.stop')"
            data-test="carousel-stop"
            @click="carousel.stop()"
          >
            <i
              class="ti ti-player-stop"
              aria-hidden="true"
            />
          </button>
        </div>

        <div
          class="announcements-view__carousel-independent"
          data-test="carousel-independent"
        >
          <IndependentProjectionButton
            :module-id="CAROUSEL_PROJECTION_MODULE"
            :claimed="carousel.independent.value"
            :before-project="prepareCarouselIndependent"
          />
          <span>{{ t('announcements.carousel.independent') }}</span>
        </div>

        <label class="announcements-view__carousel-field">
          {{ t('announcements.carousel.slideSeconds') }}
          <input
            type="number"
            :min="CAROUSEL_SLIDE_MS_MIN / 1000"
            :max="CAROUSEL_SLIDE_MS_MAX / 1000"
            step="1"
            :value="carouselSeconds"
            data-test="carousel-seconds"
            @change="onSecondsInput"
          >
        </label>
        <label class="announcements-view__carousel-check">
          <input
            type="checkbox"
            :checked="ui.carousel.value.loop"
            data-test="carousel-loop"
            @change="onLoopChange"
          >
          {{ t('announcements.carousel.loop') }}
        </label>
        <p
          v-if="skippedCount > 0"
          class="announcements-view__carousel-hint"
        >
          {{ t('announcements.carousel.skipped') }}
        </p>
      </aside>
    </div>

    <AnnouncementEditorDialog
      v-if="editing"
      :key="editing.item.id"
      :item="editing.item"
      :is-new="editing.isNew"
      @close="editing = null"
      @save="onEditorSave"
      @notice="(key, params) => ui.notify(key, 'error', params)"
    />
    <AnnouncementNameDialog
      :open="nameDialog !== null"
      :title="nameDialogTitle"
      :initial-name="nameDialog?.mode === 'rename' ? activeList.name : ''"
      @close="nameDialog = null"
      @save="onNameSave"
    />
  </section>
</template>

<style scoped lang="scss">
.announcements-view {
  display: flex;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  padding: 0.65rem clamp(1rem, 2vw, 1.5rem) 1rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.announcements-view__header,
.announcements-view__notice,
.announcements-view__content {
  width: 100%;
  max-width: 80rem;
}

.announcements-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.announcements-view__back {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.announcements-view__brand {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
}

.announcements-view__brand-icon {
  display: flex;
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.35rem;
  }
}

.announcements-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}


.announcements-view__notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem 0 0.6rem 0;
  font-size: 0.85rem;

  &--info {
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    color: var(--ds-color-on-surface);
  }

  &--error {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 16%, transparent);
    color: var(--ds-color-error, #ffb4ab);
  }

  button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}

.announcements-view__content {
  display: grid;
  flex: 1 1 auto;
  align-items: start;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1fr) 20rem;
}

.announcements-view__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.9rem;
}

.announcements-view__add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.announcements-view__add-label {
  margin-right: 0.25rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 700;
}

.announcements-view__add-btn {
  display: inline-flex;
  height: 2.2rem;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.9rem;
  border: 1px dashed color-mix(in srgb, var(--ds-color-primary) 50%, transparent);
  border-radius: 0.55rem 0 0.55rem 0;
  background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  }
}

.announcements-view__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}

.announcements-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem 1rem;
  border: 1px dashed color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: 0.9rem 0 0.9rem 0;
  color: var(--ds-color-on-surface-variant);
  text-align: center;

  .ti {
    margin-bottom: 0.5rem;
    font-size: 2rem;
    opacity: 0.6;
  }

  p {
    margin: 0.15rem 0;
    font-size: 0.85rem;
  }
}

.announcements-view__empty-title {
  color: var(--ds-color-on-surface);
  font-size: 0.95rem !important;
  font-weight: 600;
}

.announcements-view__carousel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 9%, transparent);
  border-radius: 0.9rem 0 0.9rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.announcements-view__carousel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.announcements-view__help {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover,
  &.is-open {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    color: var(--ds-color-primary);
  }

  .ti {
    font-size: 1.2rem;
  }
}

.announcements-view__help-box {
  padding: 0.65rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: 0.55rem 0 0.55rem 0;
  background: color-mix(in srgb, var(--ds-color-primary) 7%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.78rem;
  line-height: 1.4;

  p {
    margin: 0 0 0.35rem;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding-left: 1.1rem;
  }

  li + li {
    margin-top: 0.25rem;
  }
}

.announcements-view__carousel-title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1rem;
  font-weight: 600;
}

.announcements-view__preview {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  background: #000;
  color: color-mix(in srgb, #fff 35%, transparent);
  container-type: inline-size;

  .ti {
    font-size: 2rem;
  }
}

.announcements-view__position {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  text-align: center;
}

.announcements-view__carousel-start {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 0;
  border-radius: 0.55rem 0 0.55rem 0;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  cursor: pointer;
  font-weight: 700;
}

.announcements-view__carousel-controls {
  display: flex;
  justify-content: center;
  gap: 0.4rem;

  button {
    display: inline-flex;
    width: 2.5rem;
    height: 2.5rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
    color: var(--ds-color-primary);
    cursor: pointer;

    &.is-danger {
      background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 16%, transparent);
      color: var(--ds-color-error, #ffb4ab);
    }
  }
}

.announcements-view__carousel-independent {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;
}

.announcements-view__carousel-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;

  input {
    width: 4.5rem;
    height: 2.1rem;
    padding: 0 0.5rem;
    border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
    color: var(--ds-color-on-surface);
  }
}

.announcements-view__carousel-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;
}

.announcements-view__carousel-hint {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  opacity: 0.85;
}
</style>
