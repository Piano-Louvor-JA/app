// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => {
	return {
		markAllRead: vi.fn(async () => undefined),
	};
});

vi.mock("../../services/notifications", () => ({
	markAllRead: mocks.markAllRead,
	getNotifications: vi.fn(),
}));
vi.mock("@design-system/index", () => ({
	GlassCard: {
		name: "GlassCard",
		template: '<div class="glass-card-mock"><slot /></div>',
	},
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import NotificationsPanel from "../NotificationsPanel.vue";

type Notif = {
	id: number;
	type: string;
	title: string;
	body: string;
	created_at: string;
};

const NOTIFS: Notif[] = [
	{
		id: 1,
		type: "music_promoted",
		title: "Promovida",
		body: "Sua musica foi promovida!",
		created_at: "2026-09-16T12:00:00Z",
	},
	{
		id: 2,
		type: "badge_granted",
		title: "Badge",
		body: "Nova badge",
		created_at: "2026-09-16T13:00:00Z",
	},
	{
		id: 3,
		type: "tipo_desconhecido",
		title: "Misterio",
		body: "Tipo sem icone mapeada",
		created_at: "2026-09-16T14:00:00Z",
	},
];

async function mountPanel(notifs: Notif[] = NOTIFS) {
	const wrapper = mount(NotificationsPanel, {
		props: { notifications: notifs },
	});
	return wrapper;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("NotificationsPanel", () => {
	it("título + botão mark-read visíveis", async () => {
		const wrapper = await mountPanel();
		expect(wrapper.text()).toContain("notifications.title");
		expect(wrapper.text()).toContain("notifications.markRead");
	});

	it("lista todas as notificações com título e corpo", async () => {
		const wrapper = await mountPanel();
		const items = wrapper.findAll(".notifications-panel__item");
		expect(items).toHaveLength(3);
		expect(items[0].text()).toContain("Promovida");
		expect(items[2].text()).toContain("Tipo sem icone mapeada");
	});

	it("iconByType: music_promoted → ti-trophy", async () => {
		const wrapper = await mountPanel();
		expect(
			wrapper.findAll(".notifications-panel__item")[0].find(".ti-trophy").exists(),
		).toBe(true);
	});

	it("iconByType: badge_granted → ti-award", async () => {
		const wrapper = await mountPanel([
			{ ...NOTIFS[0], type: "badge_granted" },
		]);
		expect(wrapper.find(".ti-award").exists()).toBe(true);
	});

	it("iconByType: curation_approved → ti-circle-check", async () => {
		const wrapper = await mountPanel([
			{ ...NOTIFS[0], type: "curation_approved" },
		]);
		expect(wrapper.find(".ti-circle-check").exists()).toBe(true);
	});

	it("iconByType: curation_rejected → ti-circle-x", async () => {
		const wrapper = await mountPanel([
			{ ...NOTIFS[0], type: "curation_rejected" },
		]);
		expect(wrapper.find(".ti-circle-x").exists()).toBe(true);
	});

	it("iconByType: collection_published → ti-broadcast", async () => {
		const wrapper = await mountPanel([
			{ ...NOTIFS[0], type: "collection_published" },
		]);
		expect(wrapper.find(".ti-broadcast").exists()).toBe(true);
	});

	it("tipo desconhecido → fallback ti-bell", async () => {
		const wrapper = await mountPanel();
		expect(
			wrapper.findAll(".notifications-panel__item")[2].find(".ti-bell").exists(),
		).toBe(true);
	});

	it("lista vazia: mostra empty e NÃO mostra ul", async () => {
		const wrapper = await mountPanel([]);
		expect(wrapper.text()).toContain("notifications.empty");
		expect(wrapper.find(".notifications-panel__list").exists()).toBe(false);
	});

	it("markAndClose com notificações: chama markAllRead + emite mark-read e close", async () => {
		const wrapper = await mountPanel();
		await wrapper.find(".notifications-panel__mark").trigger("click");
		expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
		expect(wrapper.emitted("mark-read")).toHaveLength(1);
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("markAndClose com lista VAZIA: fecha mas NÃO marca (guard de defesa)", async () => {
		const wrapper = await mountPanel([]);
		await wrapper.find(".notifications-panel__mark").trigger("click");
		expect(mocks.markAllRead).not.toHaveBeenCalled();
		expect(wrapper.emitted("mark-read")).toBeUndefined();
		expect(wrapper.emitted("close")).toHaveLength(1);
	});
});
