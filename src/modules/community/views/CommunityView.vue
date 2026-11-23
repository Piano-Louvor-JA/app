<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import { authTokenAsync, getAuthSession } from "@modules/media/services/auth-client";
import { getAuthReadiness } from "@modules/auth/services/firebase-client";

import ReportDialog from "../components/ReportDialog.vue";
import BlockedAuthorsDialog from "../components/BlockedAuthorsDialog.vue";
import { blockAuthor } from "../services/blocks";
import { appConfirm } from "@shared/composables/useAppConfirm";
import { storeToRefs } from "pinia";
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
	toCustomCollectionId,
	updateCustomCollection,
	deleteCustomCollection,
	type CollectionVisibility,
} from "@modules/media/services/custom-catalog";
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
import MyEditsPanel from "@modules/community-edits/views/MyEditsPanel.vue";
import { listLocalEdits } from "@modules/community-edits/services/local-edits-store";
import { publishEdit } from "@modules/community-edits/services/publish-edit";
import type { ServerEditStatus } from "@modules/community-edits/views/MyEditsPanel.vue";
import { useCommunityBrowseStore } from "../stores/useCommunityBrowseStore";
import PageBackStack from "@shared/components/PageBackStack.vue";
import { useMinimizablePage } from "@shared/composables/useMinimizablePage";

const { t } = useI18n();
const router = useRouter();

const collections = ref<CommunityCollectionSummary[]>([]);
const isLoading = ref(true);
const copyingId = ref<number | null>(null);
const savedId = ref<number | null>(null);
const savedError = ref<number | null>(null);
const weeklyTasks = ref<WeeklyTask[]>([]);
const viewEl = ref<HTMLElement | null>(null);
// busca e página sobrevivem a sair e voltar para a tela
const { searchQuery, page } = storeToRefs(useCommunityBrowseStore());

/** Retrato guardado ao minimizar: busca e página da lista. */
interface CommunitySnapshot {
	searchQuery: string;
	page: number;
}

const { minimize, prepare, takeRestoredState } = useMinimizablePage<CommunitySnapshot>({
	describe: () => {
		const query = searchQuery.value.trim();
		const parts = [
			query ? t("minimize.search", { q: query }) : "",
			t("minimize.pageNumber", { n: page.value }),
		];
		return { title: t("community.title"), icon: "ti-users-group", summary: parts.filter(Boolean).join(" · ") };
	},
	capture: () => ({ searchQuery: searchQuery.value, page: page.value }),
	fallbackRoute: { name: "home" },
});

// Reaberta pela barra: volta com a busca e a página antes do 1º carregamento.
const restored = takeRestoredState();
if (restored) {
	searchQuery.value = restored.searchQuery;
	page.value = restored.page;
}
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

/* ---------- RF-04 (SPEC-crud-comunidade-hub-v1.0.0): ações do dono ---------- */
const myUserId = computed(() => getAuthSession()?.user?.id_user ?? null);

/** Toast local da Comunidade (RF-04): feedback das ações do dono. */
const ownerToast = ref<{ msg: string; error: boolean } | null>(null);
let ownerToastTimer: ReturnType<typeof setTimeout> | null = null;
function notifyOwner(msg: string, error = false): void {
	ownerToast.value = { msg, error };
	if (ownerToastTimer) clearTimeout(ownerToastTimer);
	ownerToastTimer = setTimeout(() => (ownerToast.value = null), 3500);
}

/** Minhas Edições: status do servidor (RF-05) + publish com a sessão real. */
const myServerStatuses = ref<ServerEditStatus[]>([]);
const publishInFlight = ref<number | null>(null);

async function onPublishEdit(musicId: number): Promise<void> {
  if (publishInFlight.value != null) return;
  publishInFlight.value = musicId;
  try {
    const token = await authTokenAsync();
    await publishEdit(musicId, { getToken: () => token });
  } finally {
    publishInFlight.value = null;
  }
}

function refreshMyServerStatuses(): void {
  if (!isLogged.value) {
    myServerStatuses.value = [];
    return;
  }
  void (async () => {
    try {
      const token = await authTokenAsync();
      if (!token) return;
      const res = await fetch(
        `${import.meta.env.VITE_URL_DATABASE?.replace(/\/json_db$/, '') ?? ''}/v1/custom/edits/mine`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        edits?: { musicId?: number; music_id?: number; status: string; reason?: string | null }[];
      };
      myServerStatuses.value = (body.edits ?? []).map((e) => ({
        musicId: (e.musicId ?? e.music_id) as number,
        status: e.status,
        reason: e.reason ?? null,
      }));
    } catch {
      myServerStatuses.value = [];
    }
  })();
}

async function load() {
	isLoading.value = true;
	await Promise.race([
		getAuthReadiness(),
		new Promise<void>(resolve => setTimeout(resolve, 8_000)),
	]);
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
	refreshMyServerStatuses();
	// serviços nunca lançam; falha = vazio/null.
	isLoading.value = false;
}

async function goTo(p: number) {
	if (p < 1 || p > lastPage.value || p === page.value) return;
	page.value = p;
	await load();
	// página nova começa do topo; ao só voltar para a tela, a rolagem
	// restaurada pelo AppShell fica. O scroll container é o próprio section.
	viewEl.value?.scrollTo({ top: 0, behavior: "smooth" });
}

function openReport(collection: CommunityCollectionSummary) {
	reportTarget.value = collection;
}

/* ---------- App Store 1.2: bloquear autor (paridade apk/web) ---------- */
const blockedDialogOpen = ref(false);

async function requestBlock(collection: CommunityCollectionSummary): Promise<void> {
	const token = await authTokenAsync();
	if (!token) {
		notifyOwner(t("community.loginToModerate"), true);
		return;
	}
	const name = collection.authorName || t("community.blockedNoName");
	const ok = await appConfirm({
		title: t("community.blockConfirmTitle", { name }),
		message: t("community.blockConfirmMessage"),
		confirmLabel: t("community.blockConfirm"),
		danger: true,
	});
	if (!ok) return;
	const blocked = await blockAuthor(collection.id, token);
	if (blocked) {
		notifyOwner(t("community.blockDone", { name }));
		await load(); // a API já filtra o autor bloqueado
	} else {
		notifyOwner(t("community.blockFailed"), true);
	}
}

async function closeBlockedDialog(changed: boolean): Promise<void> {
	blockedDialogOpen.value = false;
	if (changed) await load();
}

async function submitReport(reason: string) {
	const target = reportTarget.value;
	if (!target) return;
	const ok = await reportCollection(
		target.id,
		reason,
		await authTokenAsync(),
	);
	reportTarget.value = null;
	if (ok) {
		await load(); // some da lista (servidor esconde)
	}
}

/* ---------- RF-04 (SPEC-crud-comunidade-hub v1.0.0): ações do dono inline ---------- */
// Dono vê editar/renomear/visibilidade/excluir no próprio cartão; não-dono
// mantém copiar/report. Editar abre o editor do app; renomear/visibilidade
// vão direto na API (PUT /v1/custom/collections/:id); excluir com confirmação.
function isOwner(collection: CommunityCollectionSummary): boolean {
	return (
		myUserId.value != null &&
		collection.ownerId != null &&
		collection.ownerId === myUserId.value
	);
}

const renamingId = ref<number | null>(null);
const renameDraft = ref("");
const ownerActionBusy = ref(false);
const ownerErrorId = ref<number | null>(null);
const deleteConfirmId = ref<number | null>(null);

function startRename(collection: CommunityCollectionSummary): void {
	renamingId.value = collection.id;
	renameDraft.value = collection.name;
}

function cancelRename(): void {
	renamingId.value = null;
	renameDraft.value = "";
}

async function confirmRename(collection: CommunityCollectionSummary): Promise<void> {
	const name = renameDraft.value.trim();
	if (!name || name === collection.name || ownerActionBusy.value) {
		cancelRename();
		return;
	}
	ownerActionBusy.value = true;
	try {
		const updated = await updateCustomCollection(collection.id, { name });
		if (updated) {
			collection.name = updated.name || name;
		} else {
			ownerErrorId.value = collection.id;
		}
		cancelRename();
	} finally {
		ownerActionBusy.value = false;
	}
}

async function toggleVisibility(collection: CommunityCollectionSummary): Promise<void> {
	if (ownerActionBusy.value) return;
	// ausente = legado público da API (default)
	const next = (collection.visibility ?? "public") === "public" ? "private" : "public";
	ownerActionBusy.value = true;
	try {
		const updated = await updateCustomCollection(collection.id, { visibility: next });
		if (updated) {
			collection.visibility = next;
			notifyOwner(
				next === "public"
					? t("community.ownerNowPublic", { name: collection.name })
					: t("community.ownerNowPrivate", { name: collection.name }),
			);
		} else {
			ownerErrorId.value = collection.id;
			notifyOwner(t("community.ownerActionFailed"), true);
		}
	} finally {
		ownerActionBusy.value = false;
	}
}

function requestDelete(collection: CommunityCollectionSummary): void {
	deleteConfirmId.value = collection.id;
}

function cancelDelete(): void {
	deleteConfirmId.value = null;
}

async function confirmDelete(collection: CommunityCollectionSummary): Promise<void> {
	if (ownerActionBusy.value) return;
	deleteConfirmId.value = null;
	ownerActionBusy.value = true;
	try {
		const ok = await deleteCustomCollection(collection.id);
		if (ok) {
			notifyOwner(t("community.ownerDeleted", { name: collection.name }));
			await load(); // some do hub
		} else {
			ownerErrorId.value = collection.id;
			notifyOwner(t("community.ownerActionFailed"), true);
		}
	} finally {
		ownerActionBusy.value = false;
	}
}

function openEditor(collection: CommunityCollectionSummary): void {
	void router.push({ path: "/media/editor", query: { collection: String(collection.id) } });
}

function openCollection(collection: CommunityCollectionSummary): void {
	void router.push({
		name: "community-collection",
		params: { collectionId: collection.id },
	});
}

/**
 * RF-03: o destino `/albums/:collectionId` usa o namespace custom
 * (id + 2.000.000 — ver CUSTOM_COLLECTION_ID_OFFSET). Cópia local -1 →
 * card 1999999. Navegar com o id cru (-1) não encontra nenhum card e
 * produzia "Coletânea não encontrada" (falha de campo 21/11).
 */
async function saveCopy(collection: CommunityCollectionSummary) {
	// Cópia LOCAL editável, SEM tocar na origem. Telemetria é best-effort:
	// seu erro não pode converter cópia bem-sucedida em falha para o usuário.
	copyingId.value = collection.id;
	savedError.value = null;
	void registerUse(collection.id, await authTokenAsync());
	try {
		const localId = await saveCommunityCopy(collection);
		if (localId === null) {
			savedError.value = collection.id;
			return;
		}
		savedId.value = collection.id;
		await router.push({
			name: "albums-collection",
			params: { collectionId: String(toCustomCollectionId(localId)) },
		});
	} finally {
		copyingId.value = null;
	}
}

onMounted(load);
</script>

<template>
  <section ref="viewEl" class="community-view">
    <header class="community-view__header">
      <PageBackStack @minimize="minimize" @prepare="prepare">
        <button
          type="button"
          class="community-view__back"
          :aria-label="t('community.back')"
          @click="router.back()"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
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
        <a
          href="https://pianolouvorja.com.br/conduta"
          target="_blank"
          rel="noopener noreferrer"
          class="community-view__coc-link"
        >
          <i class="ti ti-shield-check" aria-hidden="true" />
          {{ t('community.conductLink') }}
        </a>
        <button
          type="button"
          class="community-view__create-btn"
          :aria-label="t('community.createCollection')"
          :title="t('community.createCollection')"
          @click="router.push('/media/editor')"
        >
          <i class="ti ti-pencil-plus" aria-hidden="true" />
          {{ t('community.createCollection') }}
        </button>
      </div>

      <MyEditsPanel
        v-if="isLogged"
        :server-statuses="myServerStatuses"
        @publish="onPublishEdit"
        class="community-view__my-edits"
      />
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
      <button
        v-if="myUserId != null"
        type="button"
        class="community-view__report-btn community-view__blocked-btn"
        data-test="community-blocked-users"
        :aria-label="t('community.blockedUsers')"
        :title="t('community.blockedUsers')"
        @click="blockedDialogOpen = true"
      >
        <i class="ti ti-user-off" aria-hidden="true" />
      </button>
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
            <span
              v-if="collection.visibility === 'private'"
              class="community-view__private-badge"
              :title="t('community.ownerPrivateBadge')"
            >🔒</span>
          </p>
          <!-- RF-04: ações do dono inline no próprio cartão -->
          <div
            v-if="isOwner(collection)"
            class="community-view__owner-actions"
          >
            <div
              v-if="renamingId === collection.id"
              class="community-view__rename"
            >
              <input
                v-model="renameDraft"
                type="text"
                class="community-view__rename-input"
                :aria-label="t('community.renameLabel')"
                @keyup.enter="confirmRename(collection)"
                @keyup.esc="cancelRename"
              >
              <button
                type="button"
                class="community-view__rename-save"
                :aria-label="t('community.renameSave')"
                @click="confirmRename(collection)"
              >
                <i class="ti ti-check" aria-hidden="true" />
              </button>
            </div>
            <div class="community-view__owner-btns">
              <button
                type="button"
                class="community-view__edit-btn"
                :aria-label="t('community.ownerEdit')"
                :title="t('community.ownerEdit')"
                @click="openEditor(collection)"
              >
                <i class="ti ti-pencil" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="community-view__rename-btn"
                :aria-label="t('community.ownerRename')"
                :title="t('community.ownerRename')"
                @click="startRename(collection)"
              >
                <i class="ti ti-text-size" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="community-view__visibility-btn"
                :aria-label="
                  collection.visibility === 'private'
                    ? t('community.ownerPublish')
                    : t('community.ownerPrivar')
                "
                :title="
                  collection.visibility === 'private'
                    ? t('community.ownerPublish')
                    : t('community.ownerPrivar')
                "
                @click="toggleVisibility(collection)"
                data-testid="community-owner-visibility"
              >
                <i
                  :class="collection.visibility === 'private' ? 'ti ti-eye' : 'ti ti-eye-off'"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="community-view__delete-btn"
                :aria-label="t('community.ownerDelete')"
                :title="t('community.ownerDelete')"
                data-testid="community-owner-delete"
                @click="requestDelete(collection)"
              >
                <i class="ti ti-trash" aria-hidden="true" />
              </button>
            </div>
            <p
              v-if="deleteConfirmId === collection.id"
              class="community-view__delete-confirm"
            >
              <span>{{ t('community.deleteConfirm') }}</span>
              <button
                type="button"
                class="community-view__delete-yes"
                @click="confirmDelete(collection)"
              >
                {{ t('community.deleteYes') }}
              </button>
              <button
                type="button"
                class="community-view__delete-no"
                @click="cancelDelete"
              >
                {{ t('community.deleteNo') }}
              </button>
            </p>
          </div>
          <div class="community-view__actions">
            <button
              type="button"
              class="community-view__open-btn"
              data-test="community-open-collection"
              @click="openCollection(collection)"
            >
              <i class="ti ti-folder-open" aria-hidden="true" />
              {{ t('community.openCollection') }}
            </button>
            <button
              type="button"
              class="community-view__copy-btn"
              data-test="community-copy-btn"
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
            <p
              v-if="savedError === collection.id"
              class="community-view__copy-error"
              data-test="community-copy-error"
              role="alert"
            >
              {{ t('community.copyFailed') }}
            </p>
            <button
              v-if="!isOwner(collection)"
              type="button"
              class="community-view__report-btn"
              :aria-label="t('ranking.report')"
              :title="t('ranking.report')"
              @click="openReport(collection)"
            >
              <i class="ti ti-flag" aria-hidden="true" />
            </button>
            <button
              v-if="!isOwner(collection) && collection.ownerId != null"
              type="button"
              class="community-view__report-btn"
              data-test="community-block-author"
              :aria-label="t('community.blockAuthor')"
              :title="t('community.blockAuthor')"
              @click="requestBlock(collection)"
            >
              <i class="ti ti-user-off" aria-hidden="true" />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>

    <div
      v-if="ownerToast"
      class="community-view__owner-toast"
      :class="{ 'community-view__owner-toast--error': ownerToast.error }"
      role="status"
    >
      {{ ownerToast.msg }}
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

    <BlockedAuthorsDialog :open="blockedDialogOpen" @close="closeBlockedDialog" />
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

.community-view__coc-link {
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
	text-decoration: none;
}

.community-view__create-btn {
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

.community-view__private-badge {
	margin-left: 4px;
	font-size: 12px;
}

.community-view__owner-toast {
	position: fixed;
	bottom: 24px;
	left: 50%;
	transform: translateX(-50%);
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 90%, transparent);
	color: var(--foreground, #fff);
	padding: 10px 18px;
	border-radius: 10px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	font-size: 14px;
	z-index: 60;
}

.community-view__owner-toast--error {
	background: color-mix(in srgb, #b3261e 85%, transparent);
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

.community-view__open-btn {
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
  white-space: nowrap;
}

.community-view__copy-btn {
  margin-top: 0;
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
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.community-view__actions .community-view__open-btn,
.community-view__actions .community-view__copy-btn {
  flex: 1 1 auto;
}

.community-view__report-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  min-height: 2.2rem;
  flex: 0 0 auto;
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
