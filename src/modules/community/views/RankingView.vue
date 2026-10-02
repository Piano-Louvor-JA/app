<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import { getAuthSession } from "@modules/media/services/auth-client";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
	getMyPosition,
	getRanking,
	type MyPosition,
	type RankingEntry,
	type RankingWindow,
} from "../services/ranking";
const { t } = useI18n();
const router = useRouter();

const window = ref<RankingWindow>("all");
const entries = ref<RankingEntry[]>([]);
const me = ref<MyPosition | null>(null);
const isLogged = ref(false);
const isLoading = ref(true);

async function load() {
	isLoading.value = true;
	const session = getAuthSession();
	isLogged.value = session !== null;
	const token = session?.token ?? null;
	const [ranking, position] = await Promise.all([
		getRanking(window.value),
		getMyPosition(window.value, token),
	]);
	entries.value = ranking;
	me.value = position;
	isLoading.value = false;
}

watch(window, load);
onMounted(load);
</script>

<template>
	<section class="ranking-view">
		<header class="ranking-view__header">
			<button
				type="button"
				class="ranking-view__back"
				:aria-label="t('community.back')"
				@click="router.push('/community')"
			>
				<i class="ti ti-arrow-left" aria-hidden="true" />
			</button>
			<div class="ranking-view__headings">
				<h1 class="ranking-view__title">{{ t("ranking.title") }}</h1>
				<p class="ranking-view__subtitle">
					{{ t("ranking.subtitle") }}
				</p>
			</div>
			<div
				class="ranking-view__tabs"
				role="tablist"
			>
				<button
					type="button"
					class="ranking-view__tab"
					:class="{ 'ranking-view__tab--active': window === 'week' }"
					role="tab"
					:aria-selected="window === 'week'"
					@click="window = 'week'"
				>
					{{ t("ranking.week") }}
				</button>
				<button
					type="button"
					class="ranking-view__tab"
					:class="{ 'ranking-view__tab--active': window === 'all' }"
					role="tab"
					:aria-selected="window === 'all'"
					@click="window = 'all'"
				>
					{{ t("ranking.all") }}
				</button>
			</div>
		</header>

		<GlassCard
			v-if="isLogged"
			class="ranking-view__me"
			elevated
		>
			<i class="ti ti-user-star" aria-hidden="true" />
			<template v-if="me && me.position !== null">
				<span>{{ t("ranking.myPosition", { position: me.position }) }}</span>
				<span class="ranking-view__me-points">
					{{ t("ranking.points", { points: me.total ?? 0 }) }}
				</span>
			</template>
			<span v-else>{{ t("ranking.notRankedYet") }}</span>
		</GlassCard>
		<GlassCard
			v-else-if="!isLoading"
			class="ranking-view__me"
			elevated
		>
			<i class="ti ti-login-2" aria-hidden="true" />
			<span>{{ t("ranking.loginToSeePosition") }}</span>
		</GlassCard>

		<p
			v-if="isLoading"
			class="ranking-view__status"
		>
			{{ t("community.loading") }}
		</p>

		<div
			v-else-if="entries.length > 0"
			class="ranking-view__list"
		>
			<div
				v-for="entry in entries"
				:key="entry.user_id"
				class="ranking-view__row"
				:class="{
					'ranking-view__row--top': entry.position === 1,
					'ranking-view__row--me': me && me.position === entry.position,
				}"
			>
				<span class="ranking-view__pos">{{ entry.position }}</span>
				<i
					class="ti"
					:class="
						entry.position === 1
							? 'ti-trophy ranking-view__trophy'
							: 'ti-user'
					"
					aria-hidden="true"
				/>
				<span class="ranking-view__name">{{ entry.display_name }}</span>
				<span class="ranking-view__points">
					{{ t("ranking.points", { points: entry.total }) }}
				</span>
			</div>
		</div>

		<p
			v-else
			class="ranking-view__status"
		>
			{{ t("ranking.empty") }}
		</p>
	</section>
</template>

<style scoped>
.ranking-view {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding: 1.5rem;
	width: 100%;
	max-width: 760px;
	margin: 0 auto;
}

.ranking-view__header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.ranking-view__back {
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

.ranking-view__title {
	margin: 0;
	font-size: 1.5rem;
}

.ranking-view__subtitle {
	margin: 0;
	opacity: 0.7;
	font-size: 0.9rem;
}

.ranking-view__tabs {
	display: flex;
	gap: 0.25rem;
	margin-left: auto;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	border-radius: 0.5rem;
	padding: 0.15rem;
}

.ranking-view__tab {
	padding: 0.35rem 0.9rem;
	border: none;
	border-radius: 0.4rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
	font-size: 0.9rem;
}

.ranking-view__tab--active {
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.15));
}

.ranking-view__me {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
}

.ranking-view__me-points {
	margin-left: auto;
	font-weight: 600;
}

.ranking-view__status {
	opacity: 0.7;
}

.ranking-view__list {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

.ranking-view__row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.6rem 1rem;
	border-radius: 0.6rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.12));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.05));
}

.ranking-view__row--top {
	border-color: rgba(255, 200, 60, 0.5);
}

.ranking-view__row--me {
	outline: 2px solid var(--ds-border, rgba(255, 255, 255, 0.35));
}

.ranking-view__pos {
	width: 1.75rem;
	text-align: center;
	font-weight: 700;
}

.ranking-view__trophy {
	color: rgb(255, 200, 60);
}

.ranking-view__name {
	flex: 1;
}

.ranking-view__points {
	font-weight: 600;
	opacity: 0.85;
}
</style>
