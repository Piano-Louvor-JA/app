<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
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
const rootEl = ref<HTMLElement | null>(null);

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

let armed = false;

function onDocClick(e: MouseEvent) {
	// só "arma" depois de um tick: o clique que ABRIU o dropdown não o fecha
	if (!armed) return;
	if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
		emit("close");
	}
}

document.addEventListener("click", onDocClick, true);
setTimeout(() => {
	armed = true;
}, 0);

function markAndClose() {
	if (props.notifications.length > 0) {
		markAllRead();
		emit("mark-read");
	}
	emit("close");
}
</script>

<template>
	<Teleport to="body">
		<div
			ref="rootEl"
			class="notif-dropdown"
		>
			<div class="notif-dropdown__head">
				<strong>{{ t("notifications.title") }}</strong>
				<button
					v-if="notifications.length > 0"
					type="button"
					class="notif-dropdown__mark"
					@click="markAndClose"
				>
					{{ t("notifications.markRead") }}
				</button>
			</div>

			<p
				v-if="notifications.length === 0"
				class="notif-dropdown__empty"
			>
				{{ t("notifications.empty") }}
			</p>

			<ul
				v-else
				class="notif-dropdown__list"
			>
				<li
					v-for="n in notifications"
					:key="n.id"
					class="notif-dropdown__item"
				>
					<i
						class="ti"
						:class="icon(n.type)"
						aria-hidden="true"
					/>
					<div class="notif-dropdown__content">
						<span class="notif-dropdown__title">{{ n.title }}</span>
						<span class="notif-dropdown__body">{{ n.body }}</span>
					</div>
				</li>
			</ul>
		</div>
	</Teleport>
</template>

<style scoped>
.notif-dropdown {
	position: fixed;
	top: 4.5rem;
	right: 1.5rem;
	z-index: 95;
	width: 22rem;
	max-height: 60vh;
	overflow-y: auto;
	padding: 0.75rem;
	border-radius: var(--ds-radius-sm, 8px 0 8px 0);
	border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 15%));
	background: var(--ds-color-surface-elevated, #1e1e1e);
	box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

.notif-dropdown__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
}

.notif-dropdown__mark {
	border: none;
	background: transparent;
	color: var(--ds-color-primary);
	font-size: 0.8rem;
	cursor: pointer;
}

.notif-dropdown__empty {
	margin: 0.25rem 0;
	font-size: 0.85rem;
	opacity: 0.7;
}

.notif-dropdown__list {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.notif-dropdown__item {
	display: flex;
	align-items: flex-start;
	gap: 0.55rem;
	padding: 0.5rem;
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--ds-color-surface-card, #201f1f) 55%, transparent);
}

.notif-dropdown__content {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}

.notif-dropdown__title {
	font-weight: 600;
	font-size: 0.88rem;
}

.notif-dropdown__body {
	font-size: 0.8rem;
	opacity: 0.75;
}
</style>
