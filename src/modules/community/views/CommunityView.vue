<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import { getAuthSession } from "@modules/media/services/auth-client";

import ReportDialog from "../components/ReportDialog.vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
	type CommunityCollectionSummary,
	listCommunityCollectionsPage,
	saveCommunityCopy,
} from "../services/community-catalog";
import { registerUse, reportCollection } from "../services/ranking";
import {
	getSeasonalEvent,
	type SeasonalEventBanner,
} from "../services/seasonal-event";
import { getWeeklyTasks, type WeeklyTask } from "../services/weekly-tasks";
import {
	type AppNotification,
	getNotifications,
} from "../services/notifications";
import NotificationsDropdown from "../components/NotificationsDropdown.vue";

const { t } = useI18n();
const router = useRouter();

const collections = ref<CommunityCollectionSummary[]>([]);
const isLoading = ref(true);
const copyingId = ref<number | null>(null);
const savedId = ref<number | null>(null);
const savedError = ref<number | null>(null);
const weeklyTasks = ref<WeeklyTask[]>([]);
const viewEl = ref<HTMLElement | null>(null);
const searchQuery = ref("");
const page = ref(1);
const lastPage = ref(1);
const total = ref(0);

const PER_PAGE = 24;
const hasPrev = computed(() => page.value > 1);
const hasNext = computed(() => page.value < lastPage.value);
const filteredCollections = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	if (!q) return collections.value;
	return collections.value.filter(
		(c) =>
			c.name.toLowerCase().includes(q) ||
			(c.authorName ?? "").toLowerCase().includes(q),
	);
});
const reportTarget = ref<CommunityCollectionSummary | null>(null);
const notifications = ref<AppNotification[]>([]);
const showNotifications = ref(false);
const isLogged = ref(false);
const seasonalEvent = ref<SeasonalEventBanner | null>(null);

async function load() {
	isLoading.value = true;
	const [result, tasks, notifs, seasonal] = await Promise.all([
		listCommunityCollectionsPage(page.value, PER_PAGE),
		getWeeklyTasks(),
		getNotifications(),
		getSeasonalEvent(),
	]);
	collections.value = result.items;
	page.value = result.page;
	lastPage.value = result.lastPage;
	total.value = result.total;
	if (tasks) weeklyTasks.value = tasks;
	notifications.value = notifs;
	isLogged.value = Boolean(getAuthSession()?.token);
	seasonalEvent.value = seasonal;
	// serviços nunca lançam; falha = vazio/null.
	isLoading.value = false;
	// o scroll container é o próprio section (a página inteira rola)
	viewEl.value?.scrollTo({ top: 0, behavior: "smooth" });
}

function goTo(p: number) {
	if (p < 1 || p > lastPage.value || p === page.value) return;
	page.value = p;
	load();
}

function openReport(collection: CommunityCollectionSummary) {
	reportTarget.value = collection;
}

async function submitReport(reason: string) {
	const target = reportTarget.value;
	if (!target) return;
	const ok = await reportCollection(
		target.id,
		reason,
		getAuthSession()?.token ?? null,
	);
	reportTarget.value = null;
	if (ok) {
		await load(); // some da lista (servidor esconde)
	}
}

async function saveCopy(collection: CommunityCollectionSummary) {
	// F0.4: cópia LOCAL editável, SEM tocar na do autor.
	// F1: registra o uso (1x/user na API; credita +5 ao dono).
	copyingId.value = collection.id;
	await registerUse(collection.id, getAuthSession()?.token ?? null);
	const localId = await saveCommunityCopy(collection);
	copyingId.value = null;
	if (localId !== null) {
		// O editor de Minhas Coletâneas está oculto por feature flag
		// (SHOW_CUSTOM_COLLECTIONS=false): dar feedback aqui, sem navegar.
		savedId.value = collection.id;
		await load();
	} else {
		savedError.value = collection.id;
	}
}

onMounted(load);
</script>

<template>
  <section class="community-view">
    <header class="community-view__header">
      <button
        type="button"
        class="community-view__back"
        :aria-label="t('community.back')"
        @click="router.back()"
      >
        <i class="ti ti-arrow-left" aria-hidden="true" />
      </button>
      <div class="community-view__headings">
        <h1 class="community-view__title">
          {{ t('community.title') }}
        </h1>
        <p class="community-view__subtitle">
          {{ t('community.subtitle') }}
        </p>
        <button
          v-if="isLogged"
          type="button"
          class="community-view__bell"
          :aria-label="t('notifications.title')"
          @click.stop="showNotifications = !showNotifications"
        >
          <i class="ti ti-bell-ringing" aria-hidden="true" />
          <span
            v-if="notifications.length > 0"
            class="community-view__bell-badge"
          >{{ notifications.length }}</span>
        </button>
        <button
          type="button"
          class="community-view__ranking-link"
          @click="router.push('/community/ranking')"
        >
          <i class="ti ti-trophy" aria-hidden="true" />
          {{ t('community.ranking') }}
        </button>
      </div>
    </header>

    <div
      v-if="seasonalEvent"
      class="community-view__event"
      role="status"
    >
      <i class="ti ti-sparkles community-view__event-icon" aria-hidden="true" />
      <div class="community-view__event-text">
        <strong>{{ seasonalEvent.name }}</strong>
        <span v-if="seasonalEvent.description">
          {{ seasonalEvent.description }}
        </span>
      </div>
      <span class="community-view__event-mult">
        x{{ seasonalEvent.multiplier }}
      </span>
    </div>

    <p
      v-if="isLoading"
      class="community-view__status"
    >
      {{ t('community.loading') }}
    </p>

    <GlassCard
      v-if="!isLoading && weeklyTasks.length > 0"
      class="community-view__tasks"
      elevated
    >
      <h2 class="community-view__tasks-title">
        <i class="ti ti-target" aria-hidden="true" />
        {{ t('ranking.weeklyTasks') }}
      </h2>
      <ul class="community-view__tasks-list">
        <li
          v-for="task in weeklyTasks"
          :key="task.id"
          class="community-view__task"
          :class="{ 'community-view__task--done': task.done }"
        >
          <i
            class="ti"
            :class="task.done ? 'ti-circle-check' : 'ti-circle'"
            aria-hidden="true"
          />
          <span class="community-view__task-desc">{{ task.description }}</span>
          <span class="community-view__task-bonus">
            {{ t('ranking.points', { points: task.bonus }) }}
          </span>
        </li>
      </ul>
    </GlassCard>

    <div class="community-view__toolbar">
      <div class="community-view__search">
        <i class="ti ti-search" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          class="community-view__search-input"
          :placeholder="t('community.searchPlaceholder')"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="community-view__search-clear"
          :aria-label="t('community.clearSearch')"
          @click="searchQuery = ''"
        >
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      v-if="!isLoading && filteredCollections.length > 0"
      class="community-view__grid"
    >
      <GlassCard
        v-for="collection in filteredCollections"
        :key="collection.id"
        class="community-view__card"
        elevated
      >
        <div
          class="community-view__cover"
          :style="
            collection.coverUrl
              ? { backgroundImage: `url(${collection.coverUrl})` }
              : undefined
          "
        >
          <i
            v-if="!collection.coverUrl"
            class="ti ti-music community-view__cover-fallback"
            aria-hidden="true"
          />
        </div>
        <div class="community-view__card-body">
          <h2 class="community-view__card-title">
            {{ collection.name }}
          </h2>
          <p
            v-if="collection.authorName"
            class="community-view__card-author"
          >
            {{ t('community.byAuthor', { author: collection.authorName }) }}
          </p>
          <p class="community-view__card-count">
            <i class="ti ti-disc" aria-hidden="true" />
            {{ t('community.trackCount', { count: collection.musicsCount }) }}
          </p>
          <div class="community-view__actions">
            <button
              type="button"
              class="community-view__copy-btn"
              :disabled="copyingId === collection.id"
              @click="saveCopy(collection)"
            >
              <i
                class="ti"
                :class="
                  copyingId === collection.id
                    ? 'ti-loader-2 ti-spin'
                    : savedId === collection.id
                      ? 'ti-check'
                      : 'ti-copy'
                "
                aria-hidden="true"
              />
              {{
                savedId === collection.id
                  ? t('community.copySaved')
                  : t('community.saveCopy')
              }}
            </button>
            <button
              type="button"
              class="community-view__report-btn"
              :aria-label="t('ranking.report')"
              :title="t('ranking.report')"
              @click="openReport(collection)"
            >
              <i class="ti ti-flag" aria-hidden="true" />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>

    <nav
      v-if="!isLoading && lastPage > 1"
      class="community-view__pagination"
      :aria-label="t('community.pagination')"
    >
      <button
        type="button"
        class="community-view__page-btn"
        :disabled="!hasPrev"
        @click="goTo(page - 1)"
      >
        <i class="ti ti-chevron-left" aria-hidden="true" />
      </button>
      <button
        v-for="p in lastPage"
        :key="p"
        type="button"
        class="community-view__page-btn"
        :class="{ 'community-view__page-btn--active': p === page }"
        @click="goTo(p)"
      >
        {{ p }}
      </button>
      <button
        type="button"
        class="community-view__page-btn"
        :disabled="!hasNext"
        @click="goTo(page + 1)"
      >
        <i class="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </nav>

    <p
      v-if="!isLoading && collections.length === 0"
      class="community-view__status"
    >
      {{ t('community.empty') }}
    </p>

    <NotificationsDropdown
      v-if="showNotifications"
      :notifications="notifications"
      @close="showNotifications = false"
      @mark-read="notifications = []"
    />

    <ReportDialog
      :open="reportTarget !== null"
      :collection-name="reportTarget?.name"
      @close="reportTarget = null"
      @submit="submitReport"
    />
  </section>
</template>

<style scoped>
.community-view {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	padding: 1.5rem;
	width: 100%;
	max-width: 1200px;
	margin: 0 auto;
	/* A página inteira rola (main do shell é overflow:hidden): o view é o
	   scroll container. Sem sub-containers com scroll interno. */
	height: 100%;
	overflow-y: auto;
	/* Firefox: esconde a barra (funciona mesmo com a global) */
	scrollbar-width: none;
}

.community-view__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.community-view__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
  background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
  color: inherit;
  cursor: pointer;
}

.community-view__title {
  margin: 0;
  font-size: 1.5rem;
}

.community-view__subtitle {
  margin: 0;
  opacity: 0.7;
}

.community-view__bell {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.4rem;
	height: 2.4rem;
	border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
	border-radius: var(--ds-radius-sm, 8px 0 8px 0);
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
	color: var(--ds-color-on-surface);
	cursor: pointer;
}

.community-view__bell-badge {
	position: absolute;
	top: -6px;
	right: -6px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.1rem;
	height: 1.1rem;
	padding: 0 0.25rem;
	border-radius: 999px;
	background: #e5484d;
	color: #fff;
	font-size: 0.68rem;
	font-weight: 700;
}

.community-view__ranking-link {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	margin-top: 0.5rem;
	padding: 0.4rem 0.8rem;
	border-radius: 0.5rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
	color: inherit;
	font-size: 0.9rem;
	cursor: pointer;
}

.community-view__tasks {
	padding: 0.75rem 1rem;
}

.community-view__tasks-title {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin: 0 0 0.5rem;
	font-size: 1rem;
}

.community-view__tasks-list {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.community-view__task {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.9rem;
}

.community-view__task--done {
	opacity: 0.55;
	text-decoration: line-through;
}

.community-view__task-desc {
	flex: 1;
}

.community-view__task-bonus {
	font-weight: 600;
	opacity: 0.8;
}

.community-view__event {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border-radius: var(--ds-radius-sm, 8px 0 8px 0);
	border: 1px solid color-mix(in srgb, var(--ds-color-primary, #e6b93c) 45%, transparent);
	background: color-mix(in srgb, var(--ds-color-primary, #e6b93c) 12%, transparent);
}

.community-view__event-icon {
	font-size: 1.3rem;
	color: var(--ds-color-primary, #e6b93c);
}

.community-view__event-text {
	display: flex;
	flex-direction: column;
	flex: 1;
	font-size: 0.9rem;
}

.community-view__event-mult {
	font-weight: 800;
	font-size: 1.05rem;
	color: var(--ds-color-primary, #e6b93c);
}

.community-view__status {
  opacity: 0.7;
}

.community-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.community-view__card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.community-view__cover {
  position: relative;
  aspect-ratio: 1 / 1;
  background-size: cover;
  background-position: center;
  background-color: rgba(128, 128, 128, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.community-view__cover-fallback {
  font-size: 2.5rem;
  opacity: 0.5;
}

.community-view__card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
}

.community-view__card-title {
  margin: 0;
  font-size: 1rem;
}

.community-view__card-author {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.community-view__card-count {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.community-view__copy-btn {
  margin-top: 0.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
  background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
  color: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.community-view__actions {
	display: flex;
	gap: 0.4rem;
	margin-top: 0.5rem;
}

.community-view__actions .community-view__copy-btn {
	flex: 1;
}

.community-view__report-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.2rem;
	border-radius: 0.5rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
	color: inherit;
	cursor: pointer;
}

.community-view__copy-btn:hover {
  filter: brightness(1.15);
}
.community-view__toolbar {
	display: flex;
	gap: 0.75rem;
}

.community-view__search {
	position: relative;
	display: flex;
	align-items: center;
	flex: 1;
	max-width: 26rem;
}

.community-view__search > .ti-search {
	position: absolute;
	left: 0.75rem;
	opacity: 0.6;
	pointer-events: none;
}

.community-view__search-input {
	width: 100%;
	padding: 0.55rem 2.4rem 0.55rem 2.2rem;
	border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
	border-radius: var(--ds-radius-sm, 8px 0 8px 0);
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
	color: var(--ds-color-on-surface);
	font: inherit;
	font-size: 0.9rem;
}

.community-view__search-input:focus {
	outline: 2px solid var(--ds-color-primary, rgba(255, 255, 255, 0.3));
	outline-offset: 1px;
}

.community-view__search-clear {
	position: absolute;
	right: 0.5rem;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.6rem;
	height: 1.6rem;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: var(--ds-color-on-surface);
	opacity: 0.6;
	cursor: pointer;
}

.community-view__search-clear:hover {
	opacity: 1;
}

.community-view__pagination {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.4rem;
	margin-top: 0.75rem;
}

.community-view__page-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 2.4rem;
	height: 2.4rem;
	padding: 0 0.5rem;
	border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.08));
	border-radius: var(--ds-radius-sm, 8px 0 8px 0);
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 70%, transparent);
	color: var(--ds-color-on-surface);
	font: inherit;
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background 150ms ease,
		border-color 150ms ease,
		color 150ms ease,
		transform 150ms ease;
}

.community-view__page-btn:hover:not(:disabled):not(.community-view__page-btn--active) {
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 45%, transparent);
	border-color: var(--ds-color-outline-strong, rgba(255, 255, 255, 0.2));
}

.community-view__page-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

/* Página ativa: pill preenchida com a primária, escala e sublinhado curto. */
.community-view__page-btn--active {
	position: relative;
	background: var(--ds-color-primary, #e6b93c);
	border-color: var(--ds-color-primary, #e6b93c);
	color: var(--ds-color-on-primary, #101010);
	font-weight: 800;
	transform: scale(1.12);
	box-shadow: 0 2px 10px rgb(0 0 0 / 35%);
	pointer-events: none;
}

.community-view__page-btn--active::after {
	content: "";
	position: absolute;
	top: -6px;
	left: 50%;
	width: 1.4rem;
	height: 3px;
	border-radius: 2px;
	background: var(--ds-color-primary, #e6b93c);
	transform: translateX(-50%);
}

.ti-spin {
	animation: community-spin 1s linear infinite;
}

@keyframes community-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>

<style>
/* Scrollbar da Comunidade invisível — bloco global p/ vencer base.css.
   O scroll continua funcionando (mouse, touch, teclado). */
.community-view {
	scrollbar-width: none !important;
	scrollbar-color: transparent transparent !important;
}

.community-view::-webkit-scrollbar {
	display: none !important;
	width: 0 !important;
	height: 0 !important;
}
</style>
