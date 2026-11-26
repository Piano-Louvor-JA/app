<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import {
	deleteLocalCollection,
	type LocalCollection,
} from "@modules/media/services/local-custom-store";
import { listCommunityCopies } from "@modules/media/services/community-copies";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import PageBackStack from "@shared/components/PageBackStack.vue";
import { useMinimizablePage } from "@shared/composables/useMinimizablePage";

const { t } = useI18n();
const router = useRouter();

const copies = ref<LocalCollection[]>([]);

const { minimize, prepare } = useMinimizablePage({
	describe: () => ({
		title: t("community.copies.title"),
		icon: "ti-copy",
		summary: t("community.copies.subtitle"),
	}),
	capture: () => ({}),
	fallbackRoute: { name: "community" },
});

function reload() {
	copies.value = listCommunityCopies();
}
reload();

const isEmpty = computed(() => copies.value.length === 0);

function openCopy(collection: LocalCollection) {
	void router.push(`/community/copies/${collection.id}`);
}

function removeCopy(collection: LocalCollection) {
	deleteLocalCollection(collection.id);
	reload();
}
</script>

<template>
	<section class="community-copies-view">
		<header class="community-copies-view__header">
			<PageBackStack @minimize="minimize" @prepare="prepare">
				<button
					type="button"
					class="community-copies-view__back"
					:aria-label="t('community.back')"
					@click="router.back()"
				>
					<i class="ti ti-arrow-left" aria-hidden="true" />
				</button>
			</PageBackStack>
			<div class="community-copies-view__headings">
				<h1 class="community-copies-view__title">
					{{ t('community.copies.title') }}
				</h1>
				<p class="community-copies-view__subtitle">
					{{ t('community.copies.subtitle') }}
				</p>
			</div>
		</header>

		<p
			v-if="isEmpty"
			class="community-copies-view__empty"
			role="status"
		>
			{{ t('community.copies.empty') }}
		</p>

		<GlassCard
			v-for="copy in copies"
			:key="copy.id"
			class="community-copies-view__card"
		>
			<div class="community-copies-view__info">
				<span class="community-copies-view__badge">{{ t('community.copies.badge') }}</span>
				<strong class="community-copies-view__name">{{ copy.name }}</strong>
			</div>
			<div class="community-copies-view__actions">
				<button
					type="button"
					class="community-copies-view__open"
					@click="openCopy(copy)"
				>
					<i class="ti ti-player-play" aria-hidden="true" />
					{{ t('community.copies.open') }}
				</button>
				<button
					type="button"
					class="community-copies-view__delete"
					:aria-label="t('community.copies.delete')"
					@click="removeCopy(copy)"
				>
					<i class="ti ti-trash" aria-hidden="true" />
				</button>
			</div>
		</GlassCard>
	</section>
</template>

<style scoped>
.community-copies-view {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.community-copies-view__header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.community-copies-view__title {
	margin: 0;
	font-size: 1.25rem;
}

.community-copies-view__subtitle {
	margin: 0;
	opacity: 0.7;
	font-size: 0.9rem;
}

.community-copies-view__empty {
	opacity: 0.7;
	text-align: center;
	padding: 32px 0;
}

.community-copies-view__card {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 16px;
}

.community-copies-view__info {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.community-copies-view__badge {
	font-size: 0.7rem;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--surface-accent, #4a6cf7);
	color: #fff;
	white-space: nowrap;
}

.community-copies-view__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.community-copies-view__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.community-copies-view__delete {
	opacity: 0.7;
}
</style>
