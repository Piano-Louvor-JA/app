<script setup lang="ts">
// Adendo premium/clean (23/11): "Tarefas da semana" saiu do card inline da
// CommunityView e ganhou view própria (/community/tasks) — a Comunidade
// fica só com busca + grid. Mesmo service (getWeeklyTasks), mesma semântica.
import PageBackStack from "@shared/components/PageBackStack.vue";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import { completeWeeklyTask, getWeeklyTasks, type WeeklyTask } from "../services/weekly-tasks";

const { t } = useI18n();
const router = useRouter();

const tasks = ref<WeeklyTask[]>([]);
const isLoading = ref(true);
const completingIds = ref(new Set<string>());
const toast = ref<{ message: string; error: boolean } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string, error = false): void {
	toast.value = { message, error };
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (toast.value = null), 4_000);
}

onMounted(() => {
	void (async () => {
		tasks.value = (await getWeeklyTasks()) ?? [];
		isLoading.value = false;
	})();
});

async function markDone(task: WeeklyTask): Promise<void> {
	if (task.done || completingIds.value.has(task.id)) return;
	completingIds.value.add(task.id);
	try {
		const credited = await completeWeeklyTask(task.id);
		task.done = true;
		showToast(
			credited
				? t("community.taskCredited", { points: task.bonus })
				: t("community.taskDone"),
		);
	} catch {
		showToast(t("community.taskCompleteFailed"), true);
	} finally {
		completingIds.value.delete(task.id);
	}
}

</script>

<template>
  <section class="weekly-tasks-view">
    <header class="weekly-tasks-view__header">
      <PageBackStack>
        <button
          type="button"
          class="weekly-tasks-view__back"
          :aria-label="t('community.back')"
          @click="router.push({ name: 'community' })"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
      <div class="weekly-tasks-view__headings">
        <h1 class="weekly-tasks-view__title">
          <i class="ti ti-target" aria-hidden="true" />
          {{ t('ranking.weeklyTasks') }}
        </h1>
        <p class="weekly-tasks-view__subtitle">
          {{ t('community.weeklyTasksSubtitle') }}
        </p>
      </div>
    </header>

    <p
      v-if="isLoading"
      class="weekly-tasks-view__status"
    >
      {{ t('community.loading') }}
    </p>

    <p
      v-else-if="tasks.length === 0"
      class="weekly-tasks-view__status"
    >
      {{ t('community.weeklyTasksEmpty') }}
    </p>

    <ul
      v-else
      class="weekly-tasks-view__list"
    >
      <li
        v-for="task in tasks"
        :key="task.id"
        class="weekly-tasks-view__task"
        :class="{ 'weekly-tasks-view__task--done': task.done }"
      >
        <i
          class="ti"
          :class="task.done ? 'ti-circle-check' : 'ti-circle'"
          aria-hidden="true"
        />
        <span class="weekly-tasks-view__task-desc">{{ task.description }}</span>
        <span class="weekly-tasks-view__task-bonus">
          {{ t('ranking.points', { points: task.bonus }) }}
        </span>
        <button
          v-if="!task.done"
          type="button"
          class="weekly-tasks-view__task-complete"
          :data-test="`weekly-task-complete-${task.id}`"
          :disabled="completingIds.has(task.id)"
          @click="markDone(task)"
        >
          {{ completingIds.has(task.id) ? t('community.loading') : t('community.taskComplete') }}
        </button>
      </li>
    </ul>

    <transition name="weekly-tasks-view__toast-fade">
      <p
        v-if="toast"
        class="weekly-tasks-view__toast"
        :class="{ 'weekly-tasks-view__toast--error': toast.error }"
        role="status"
        data-test="weekly-task-toast"
      >
        {{ toast.message }}
      </p>
    </transition>
  </section>
</template>

<style scoped>
.weekly-tasks-view {
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

.weekly-tasks-view__header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.weekly-tasks-view__back {
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

.weekly-tasks-view__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	font-size: 1.5rem;
}

.weekly-tasks-view__subtitle {
	margin: 0;
	opacity: 0.7;
}

.weekly-tasks-view__status {
	opacity: 0.7;
}

.weekly-tasks-view__list {
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.weekly-tasks-view__task {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.75rem 1rem;
	border-radius: 0.75rem;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(255, 255, 255, 0.08));
	font-size: 0.95rem;
}

.weekly-tasks-view__task--done {
	opacity: 0.55;
	text-decoration: line-through;
}

.weekly-tasks-view__task-desc {
	flex: 1;
}

.weekly-tasks-view__task-bonus {
	font-weight: 600;
	opacity: 0.8;
}

.weekly-tasks-view__task-complete {
	flex-shrink: 0;
	padding: 0.4rem 0.9rem;
	border-radius: 999px;
	border: 1px solid transparent;
	background: var(--ds-accent, #4f7cff);
	color: #fff;
	font-weight: 600;
	font-size: 0.85rem;
	cursor: pointer;
}

.weekly-tasks-view__task-complete:disabled {
	opacity: 0.6;
	cursor: wait;
}

.weekly-tasks-view__toast {
	position: fixed;
	bottom: 1.5rem;
	left: 50%;
	transform: translateX(-50%);
	margin: 0;
	padding: 0.7rem 1.2rem;
	border-radius: 999px;
	border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.2));
	background: var(--ds-glass-fill, rgba(20, 20, 25, 0.9));
	font-size: 0.9rem;
	z-index: 10;
}

.weekly-tasks-view__toast--error {
	border-color: rgba(255, 90, 90, 0.6);
}

.weekly-tasks-view__toast-fade-enter-active,
.weekly-tasks-view__toast-fade-leave-active {
	transition: opacity 0.2s ease;
}

.weekly-tasks-view__toast-fade-enter-from,
.weekly-tasks-view__toast-fade-leave-to {
	opacity: 0;
}
</style>
