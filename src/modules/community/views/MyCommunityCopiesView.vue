<script setup lang="ts">
// SPEC louvorja-community-copies adendo v1.1.0: "Minhas Cópias" virou VIEW
// PRÓPRIA (rota /community/copies) — sai da lista inline da CommunityView.
// Comportamento do commit 879fb762 preservado: cards com estética myCopies,
// clique abre a cópia pelo id local CRU (rota community-copy), delete
// remove só a cópia local e reflete na lista sem reload.
import { GlassCard } from "@design-system/index";
import PageBackStack from "@shared/components/PageBackStack.vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
	listLocalCollections,
	listLocalMusics,
	type LocalCollection,
} from "@modules/media/services/local-custom-store";
import { deleteCustomCollection } from "@modules/media/services/custom-catalog";

const { t } = useI18n();
const router = useRouter();

const myCopies = ref<LocalCollection[]>([]);
const isLoading = ref(true);

/** Cópias locais da Comunidade (origin.type='community'), recentes primeiro. */
function loadMyCopies(): void {
	myCopies.value = listLocalCollections()
		.filter((c) => c.origin?.type === "community")
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const isEmpty = computed(() => !isLoading.value && myCopies.value.length === 0);

/** Id local (negativo) da cópia aguardando confirmação de exclusão. */
const deleteConfirmId = ref<number | null>(null);
const deleteBusy = ref(false);

function requestDelete(copy: LocalCollection): void {
	deleteConfirmId.value = copy.id;
}

function cancelDelete(): void {
	deleteConfirmId.value = null;
}

/**
 * Exclui SÓ a cópia local (id cru negativo → deleteCustomCollection cai no
 * store local; a origem da Comunidade permanece intacta) e remove o card
 * da lista reativamente, sem reload.
 */
async function confirmDelete(copy: LocalCollection): Promise<void> {
	if (deleteBusy.value) return;
	deleteConfirmId.value = null;
	deleteBusy.value = true;
	try {
		const ok = await deleteCustomCollection(copy.id);
		if (ok) {
			myCopies.value = myCopies.value.filter((c) => c.id !== copy.id);
		}
	} finally {
		deleteBusy.value = false;
	}
}

/** Abre a cópia na rota dedicada com o id local CRU (igual ao saveCopy/D3). */
function openCopy(copy: LocalCollection): void {
	void router.push({
		name: "community-copy",
		params: { collectionId: String(copy.id) },
	});
}

function trackCount(copy: LocalCollection): number {
	return listLocalMusics(copy.id).length;
}

onMounted(() => {
	loadMyCopies();
	isLoading.value = false;
});
</script>

<template>
  <section class="my-copies-view">
    <header class="my-copies-view__header">
      <PageBackStack>
        <button
          type="button"
          class="my-copies-view__back"
          :aria-label="t('community.back')"
          @click="router.push({ name: 'community' })"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
      <div class="my-copies-view__headings">
        <h1 class="my-copies-view__title">
          <i class="ti ti-copy" aria-hidden="true" />
          {{ t('community.myCopies') }}
        </h1>
        <p class="my-copies-view__subtitle">
          {{ t('community.myCopiesSubtitle') }}
        </p>
      </div>
    </header>

    <p v-if="isLoading" class="my-copies-view__status">
      {{ t('community.loading') }}
    </p>

    <p v-else-if="isEmpty" class="my-copies-view__status">
      {{ t('community.myCopiesEmpty') }}
    </p>

    <div v-else class="my-copies-view__grid">
      <GlassCard
        v-for="copy in myCopies"
        :key="copy.id"
        class="my-copies-view__card"
        elevated
      >
        <button
          type="button"
          class="my-copies-view__open"
          data-test="community-copy-card"
          :aria-label="copy.name"
          @click="openCopy(copy)"
        >
          <div class="my-copies-view__cover">
            <i class="ti ti-copy my-copies-view__cover-fallback" aria-hidden="true" />
          </div>
          <div class="my-copies-view__card-body">
            <h3 class="my-copies-view__card-title">{{ copy.name }}</h3>
            <p class="my-copies-view__card-count">
              <i class="ti ti-disc" aria-hidden="true" />
              {{ t('community.trackCount', { count: trackCount(copy) }) }}
            </p>
          </div>
        </button>
        <button
          type="button"
          class="my-copies-view__delete"
          data-test="community-copy-delete"
          :aria-label="t('community.ownerDelete')"
          :title="t('community.ownerDelete')"
          @click.stop="requestDelete(copy)"
        >
          <i class="ti ti-trash" aria-hidden="true" />
        </button>
        <p
          v-if="deleteConfirmId === copy.id"
          class="my-copies-view__delete-confirm"
          data-test="community-copy-delete-confirm"
        >
          <span>{{ t('community.deleteConfirm') }}</span>
          <button
            type="button"
            class="my-copies-view__delete-yes"
            :disabled="deleteBusy"
            @click="confirmDelete(copy)"
          >
            {{ t('community.deleteYes') }}
          </button>
          <button
            type="button"
            class="my-copies-view__delete-no"
            @click="cancelDelete"
          >
            {{ t('community.deleteNo') }}
          </button>
        </p>
      </GlassCard>
    </div>
  </section>
</template>

<style scoped>
.my-copies-view {
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

.my-copies-view__header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.my-copies-view__back {
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

.my-copies-view__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	font-size: 1.5rem;
}

.my-copies-view__subtitle {
	margin: 0;
	opacity: 0.7;
}

.my-copies-view__status {
	opacity: 0.7;
}

.my-copies-view__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 1rem;
}

.my-copies-view__card {
	position: relative;
	padding: 0;
}

.my-copies-view__open {
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

.my-copies-view__open:hover .my-copies-view__card-title {
	text-decoration: underline;
}

.my-copies-view__cover {
	position: relative;
	aspect-ratio: 1 / 1;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: rgba(128, 128, 128, 0.2);
}

.my-copies-view__cover-fallback {
	font-size: 2.5rem;
	opacity: 0.5;
}

.my-copies-view__card-body {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.75rem;
}

.my-copies-view__card-title {
	margin: 0;
	font-size: 1rem;
}

.my-copies-view__card-count {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0;
	font-size: 0.85rem;
	opacity: 0.7;
}

/* Lixeira no canto do card (padrão album-delete-collection). */
.my-copies-view__delete {
	position: absolute;
	top: 0.5rem;
	right: 0.5rem;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	border-radius: 50%;
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 80%, transparent);
	color: inherit;
	cursor: pointer;
}

.my-copies-view__delete:hover {
	filter: brightness(1.2);
}

.my-copies-view__delete-confirm {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	padding: 0.5rem 0.75rem;
	font-size: 0.85rem;
}

.my-copies-view__delete-yes,
.my-copies-view__delete-no {
	padding: 0.25rem 0.6rem;
	border-radius: 0.4rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
	color: inherit;
	cursor: pointer;
}
</style>
