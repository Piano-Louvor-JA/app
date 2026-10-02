<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import { useI18n } from "vue-i18n";
import { markAllRead } from "../services/notifications";

const props = defineProps<{
	notifications: Array<{
		id: number;
		type: string;
		title: string;
		body: string;
		created_at: string;
	}>;
}>();

const emit = defineEmits<{
	close: [];
	"mark-read": [];
}>();

const { t } = useI18n();

const iconByType: Record<string, string> = {
	music_promoted: "ti-trophy",
	curation_approved: "ti-circle-check",
	curation_rejected: "ti-circle-x",
	collection_published: "ti-broadcast",
	badge_granted: "ti-award",
};

function icon(type: string): string {
	return iconByType[type] ?? "ti-bell";
}

function closeAndMark() {
	if (props.notifications.length > 0) {
		markAllRead();
		emit("mark-read");
	}
	emit("close");
}
</script>

<template>
	<GlassCard
		class="notifications-panel"
		elevated
	>
		<div class="notifications-panel__head">
			<h2 class="notifications-panel__title">
				<i class="ti ti-bell-ringing" aria-hidden="true" />
				{{ t("notifications.title") }}
			</h2>
			<button
				type="button"
				class="notifications-panel__mark"
				@click="closeAndMark"
			>
				{{ t("notifications.markRead") }}
			</button>
		</div>
		<p
			v-if="notifications.length === 0"
			class="notifications-panel__empty"
		>
			{{ t("notifications.empty") }}
		</p>
		<ul
			v-else
			class="notifications-panel__list"
		>
			<li
				v-for="n in notifications"
				:key="n.id"
				class="notifications-panel__item"
			>
				<i
					class="ti"
					:class="icon(n.type)"
					aria-hidden="true"
				/>
				<div class="notifications-panel__content">
					<span class="notifications-panel__item-title">{{ n.title }}</span>
					<span class="notifications-panel__item-body">{{ n.body }}</span>
				</div>
			</li>
		</ul>
	</GlassCard>
</template>

<style scoped>
.notifications-panel {
	padding: 0.75rem 1rem;
}

.notifications-panel__empty {
	margin: 0.25rem 0 0;
	font-size: 0.85rem;
	opacity: 0.7;
}

.notifications-panel__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
}

.notifications-panel__title {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin: 0;
	font-size: 1rem;
}



.notifications-panel__mark {
	border: none;
	background: transparent;
	color: inherit;
	font-size: 0.8rem;
	opacity: 0.7;
	cursor: pointer;
	text-decoration: underline;
}



.notifications-panel__list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.notifications-panel__item {
	display: flex;
	align-items: flex-start;
	gap: 0.6rem;
	padding: 0.5rem;
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 55%, transparent);
}

.notifications-panel__content {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.notifications-panel__item-title {
	font-weight: 600;
	font-size: 0.9rem;
}

.notifications-panel__item-body {
	font-size: 0.82rem;
	opacity: 0.75;
}
</style>
