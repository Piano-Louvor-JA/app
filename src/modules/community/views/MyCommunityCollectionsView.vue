<script setup lang="ts">
// SPEC louvorja-community-copies adendo v1.1.0: "Minhas Coletâneas" virou
// VIEW PRÓPRIA (rota /community/my-collections) — produzidas do usuário
// vivem APENAS aqui (nunca na Central de Mídia; a categoria custom de
// /albums foi removida). Cópias da Comunidade NÃO entram (ficam em
// "Minhas Cópias"): filtro espelha filterCustomCollectionsForAlbums +
// exclusão de origin.type='community'.
import { GlassCard } from "@design-system/index";
import PageBackStack from "@shared/components/PageBackStack.vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
	listCustomCollections,
	updateCustomCollection,
} from "@modules/media/services/custom-catalog";
import {
	listLocalCollections,
	listLocalMusics,
} from "@modules/media/services/local-custom-store";
// Regra de ownership (RF-03): locais + remotas ownerId===meu id_user.
import { filterCustomCollectionsForAlbums } from "@modules/albums/services/visibility-owner-filter";

const { t } = useI18n();
const router = useRouter();

type MyCollectionCard = {
	/** id local CRU (negativo) ou id remoto (positivo). */
	rawId: number;
	name: string;
	description: string | null;
	coverUrl: string | null;
	musicsCount: number;
	/** Rota de destino: local usa o namespace custom; remota abre na Comunidade. */
	isLocal: boolean;
};

const myCollections = ref<MyCollectionCard[]>([]);
const isLoading = ref(true);

/**
 * Coletâneas PRODUZIDAS pelo usuário:
 * - locais (id negativo) — mas NÃO cópias (origin.type='community');
 * - remotas ownerId === meu id_user (regra RF-03 compartilhada).
 */
async function loadMyCollections(): Promise<void> {
	const copyLocalIds = new Set(
		listLocalCollections()
			.filter((c) => c.origin?.type === "community")
			.map((c) => c.id),
	);
	const mine = filterCustomCollectionsForAlbums(await listCustomCollections())
		.filter((c) => !copyLocalIds.has(c.id))
		.map<MyCollectionCard>((c) => ({
			rawId: c.id,
			name: c.name,
			description: c.description,
			coverUrl: c.coverUrl ?? null,
			musicsCount: c.musicsCount,
			isLocal: c.id < 0,
		}));
	myCollections.value = mine;
}

const isEmpty = computed(
	() => !isLoading.value && myCollections.value.length === 0,
);

/** Local cru (negativo) abre na rota custom; remota abre na Comunidade. */
function openCollection(card: MyCollectionCard): void {
	if (card.isLocal) {
		void router.push({
			name: "community-custom",
			// id local CRU (negativo): buildCustomCollectionCard resolve
			// sob demanda (mesma regra do D3 — offset seria ambíguo).
			params: { collectionId: String(card.rawId) },
		});
		return;
	}
	void router.push({
		name: "community-collection",
		params: { collectionId: String(card.rawId) },
	});
}

function trackCount(card: MyCollectionCard): number {
	return card.isLocal ? listLocalMusics(card.rawId).length : card.musicsCount;
}

onMounted(async () => {
	await loadMyCollections();
	isLoading.value = false;
});
</script>

<template>
  <section class="my-collections-view">
    <header class="my-collections-view__header">
      <PageBackStack>
        <button
          type="button"
          class="my-collections-view__back"
          :aria-label="t('community.back')"
          @click="router.push({ name: 'community' })"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
      <div class="my-collections-view__headings">
        <h1 class="my-collections-view__title">
          <i class="ti ti-disc" aria-hidden="true" />
          {{ t('community.myCollections') }}
        </h1>
        <p class="my-collections-view__subtitle">
          {{ t('community.myCollectionsSubtitle') }}
        </p>
        <button
          type="button"
          class="my-collections-view__create-btn"
          :aria-label="t('community.createCollection')"
          @click="router.push('/media/editor')"
        >
          <i class="ti ti-pencil-plus" aria-hidden="true" />
          {{ t('community.createCollection') }}
        </button>
      </div>
    </header>

    <p v-if="isLoading" class="my-collections-view__status">
      {{ t('community.loading') }}
    </p>

    <p v-else-if="isEmpty" class="my-collections-view__status">
      {{ t('community.myCollectionsEmpty') }}
    </p>

    <div v-else class="my-collections-view__grid">
      <GlassCard
        v-for="card in myCollections"
        :key="card.rawId"
        class="my-collections-view__card"
        elevated
      >
        <button
          type="button"
          class="my-collections-view__open"
          data-test="community-custom-card"
          :aria-label="card.name"
          @click="openCollection(card)"
        >
          <div
            class="my-collections-view__cover"
            :style="card.coverUrl ? { backgroundImage: `url(${card.coverUrl})` } : undefined"
          >
            <i
              v-if="!card.coverUrl"
              class="ti ti-disc my-collections-view__cover-fallback"
              aria-hidden="true"
            />
          </div>
          <div class="my-collections-view__card-body">
            <h3 class="my-collections-view__card-title">{{ card.name }}</h3>
            <p class="my-collections-view__card-count">
              <i class="ti ti-disc" aria-hidden="true" />
              {{ t('community.trackCount', { count: trackCount(card) }) }}
            </p>
          </div>
        </button>
      </GlassCard>
    </div>
  </section>
</template>

<style scoped>
.my-collections-view {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	padding: 1.5rem;
	width: 100%;
	max-width: 1200px;
	margin: 0 auto;
	height: 100%;
	overflow-y: auto;
	scrollbar-width: none;
}

.my-collections-view__header {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
}

.my-collections-view__back {
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
	flex-shrink: 0;
}

.my-collections-view__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	font-size: 1.5rem;
}

.my-collections-view__subtitle {
	margin: 0.25rem 0 0;
	opacity: 0.7;
}

.my-collections-view__create-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	margin-top: 0.5rem;
	padding: 0.4rem 0.8rem;
	border-radius: 0.5rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
	color: inherit;
	cursor: pointer;
}

.my-collections-view__status {
	opacity: 0.7;
}

.my-collections-view__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 1rem;
}

.my-collections-view__card {
	padding: 0;
}

.my-collections-view__open {
	display: block;
	width: 100%;
	padding: 0;
	border: none;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.my-collections-view__open:hover .my-collections-view__card-title {
	text-decoration: underline;
}

.my-collections-view__cover {
	position: relative;
	aspect-ratio: 1 / 1;
	background-size: cover;
	background-position: center;
	background-color: rgba(128, 128, 128, 0.2);
	display: flex;
	align-items: center;
	justify-content: center;
}

.my-collections-view__cover-fallback {
	font-size: 2.5rem;
	opacity: 0.5;
}

.my-collections-view__card-body {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.75rem;
}

.my-collections-view__card-title {
	margin: 0;
	font-size: 1rem;
}

.my-collections-view__card-count {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0;
	font-size: 0.85rem;
	opacity: 0.7;
}
</style>
