import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("vue-i18n", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
	}),
}));

const completeWeeklyTask = vi.fn();
vi.mock("../../services/weekly-tasks", () => ({
	getWeeklyTasks: vi.fn(),
	completeWeeklyTask: (...a: unknown[]) => completeWeeklyTask(...a),
}));

import WeeklyTasksView from "../WeeklyTasksView.vue";

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: {} as never }] });

const { getWeeklyTasks } = await import("../../services/weekly-tasks");

function mountView() {
	return mount(WeeklyTasksView, { global: { plugins: [router] } });
}

const TASKS = [
	{ id: "use_others", description: "Use 2 coletâneas", done: false, bonus: 15 },
	{ id: "create_one", description: "Crie uma coletânea", done: true, bonus: 15 },
];

describe("WeeklyTasksView — concluir tarefa", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getWeeklyTasks.mockImplementation(async () => TASKS.map(t2 => ({ ...t2 })));
	});

	it("renderiza botão Concluir só em tarefa pendente", async () => {
		const w = await mountView();
		await flushPromises();
		expect(w.find('[data-test="weekly-task-complete-use_others"]').exists()).toBe(true);
		expect(w.find('[data-test="weekly-task-complete-create_one"]').exists()).toBe(false);
	});

	it("concluir chama completeWeeklyTask, marca done e mostra toast creditado", async () => {
		completeWeeklyTask.mockResolvedValue(true);
		const w = await mountView();
		await flushPromises();
		await w.find('[data-test="weekly-task-complete-use_others"]').trigger("click");
		await flushPromises();
		expect(completeWeeklyTask).toHaveBeenCalledWith("use_others");
		const task = w.vm.tasks.find((x: { id: string }) => x.id === "use_others");
		expect(task.done).toBe(true);
		expect(w.find('[data-test="weekly-task-toast"]').text()).toContain("taskCredited");
	});

	it("credited=false mostra toast neutro", async () => {
		completeWeeklyTask.mockResolvedValue(false);
		const w = await mountView();
		await flushPromises();
		await w.find('[data-test="weekly-task-complete-use_others"]').trigger("click");
		await flushPromises();
		expect(w.find('[data-test="weekly-task-toast"]').text()).toContain("taskDone");
	});

	it("falha não marca done e mostra toast de erro", async () => {
		completeWeeklyTask.mockRejectedValue(new Error("net"));
		const w = await mountView();
		await flushPromises();
		await w.find('[data-test="weekly-task-complete-use_others"]').trigger("click");
		await flushPromises();
		const task = w.vm.tasks.find((x: { id: string }) => x.id === "use_others");
		expect(task.done).toBe(false);
		expect(w.find('[data-test="weekly-task-toast"]').text()).toContain("taskCompleteFailed");
	});
});
