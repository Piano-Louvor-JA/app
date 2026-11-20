// @vitest-environment jsdom
// RF-04 (SPEC-crud-comunidade-hub v1.0.0): /community como hub único.
// Dono vê ações inline (editar/renomear/visibilidade/excluir);
// não-dono vê só salvar cópia + report (existente).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string; user: { id_user: number } }),
	listCommunityCollectionsPage: vi.fn(async () => ({
		items: [],
		page: 1,
		lastPage: 1,
		total: 0,
	})),
	saveCommunityCopy: vi.fn(async () => 777),
	updateCustomCollection: vi.fn(async () => null),
	deleteCustomCollection: vi.fn(async () => true),
	updateLocalCollection: vi.fn(() => true),
	deleteLocalCollection: vi.fn(() => true),
	isLocalId: vi.fn((id: number) => id < 0),
}));

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: mocks.getSession,
	authTokenAsync: async () => mocks.getSession()?.token ?? null,
}));

vi.mock("../../services/community-catalog", () => ({
	listCommunityCollectionsPage: mocks.listCommunityCollectionsPage,
	saveCommunityCopy: mocks.saveCommunityCopy,
	sortByRecentFirst: (xs: unknown[]) => xs,
}));

vi.mock("@modules/media/services/custom-catalog", () => ({
	updateCustomCollection: mocks.updateCustomCollection,
	deleteCustomCollection: mocks.deleteCustomCollection,
	isLocalId: mocks.isLocalId,
}));

vi.mock("@modules/media/services/local-custom-store", () => ({
	updateLocalCollection: mocks.updateLocalCollection,
	deleteLocalCollection: mocks.deleteLocalCollection,
}));

vi.mock("../../services/ranking", () => ({
	getRanking: vi.fn(async () => ({ data: [] })),
	registerUse: vi.fn(async () => true),
	reportCollection: vi.fn(async () => true),
}));
vi.mock("../../services/notifications", () => ({
	getNotifications: vi.fn(async () => []),
	markAllRead: vi.fn(async () => undefined),
}));
vi.mock("../../services/weekly-tasks", () => ({
	getWeeklyTasks: vi.fn(async () => null),
	completeWeeklyTask: vi.fn(),
}));
vi.mock("../../services/seasonal-event", () => ({
	getSeasonalEvent: vi.fn(async () => null),
}));
vi.mock("@modules/auth/services/firebase-client", () => ({
	getAuthReadiness: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@modules/community-edits/services/local-edits-store", () => ({
	listLocalEdits: vi.fn(() => []),
}));
vi.mock("@modules/community-edits/services/publish-edit", () => ({
	publishEdit: vi.fn(async () => undefined),
}));
vi.mock("@modules/community-edits/views/MyEditsPanel.vue", () => ({
	default: { name: "MyEditsPanel", template: "<div />" },
}));
vi.mock("@design-system/index", () => ({
	GlassCard: { name: "GlassCard", template: '<div class="glass-card-mock"><slot /></div>' },
}));
vi.mock("@shared/components/PageBackStack.vue", () => ({
	default: { name: "PageBackStack", template: "<div><slot /></div>" },
}));
vi.mock("@shared/composables/useMinimizablePage", () => ({
	useMinimizablePage: () => ({
		minimize: vi.fn(async () => {}),
		prepare: vi.fn(),
		takeRestoredState: () => null,
	}),
}));
vi.mock("../../components/NotificationsDropdown.vue", () => ({
	default: { name: "NotificationsDropdown", template: "<div />" },
}));
vi.mock("../../components/ReportDialog.vue", () => ({
	default: { name: "ReportDialog", template: "<div />" },
}));
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CommunityView from "../CommunityView.vue";

const SESSION = { token: "tok", user: { id_user: 4 } };

const ITEMS = [
	{
		id: 9,
		name: "Minha coletânea pública",
		description: null,
		coverUrl: null,
		authorName: "Eu",
		musicsCount: 3,
		updatedAt: null,
		ownerId: 4,
	},
	{
		id: 10,
		name: "De outro irmão",
		description: null,
		coverUrl: null,
		authorName: "Autor",
		musicsCount: 5,
		updatedAt: null,
		ownerId: 12,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
	setActivePinia(createPinia());
	// páginas devolvem CÓPIAS: mutações de card (rename/visibility) não
	// vazam entre testes
	mocks.listCommunityCollectionsPage.mockImplementation(async () => ({
		items: ITEMS.map((x) => ({ ...x })),
		page: 1,
		lastPage: 1,
		total: 2,
	}));
});

async function mountView() {
	const w = mount(CommunityView);
	await flushPromises();
	await flushPromises();
	return w;
}

describe("CommunityView — RF-04 ações do dono inline", () => {
	it("dono logado: cartão próprio mostra ações de editar/renomear/visibilidade/excluir", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: ITEMS.map((x) => ({ ...x })),
			page: 1,
			lastPage: 1,
			total: 2,
		});
		const w = await mountView();
		const cards = w.findAll(".community-view__card");
		expect(cards).toHaveLength(2);
		// card do dono (id 9) tem as ações inline
		const ownerCard = cards.find((c) => c.text().includes("Minha coletânea pública"))!;
		expect(ownerCard.find(".community-view__edit-btn").exists()).toBe(true);
		expect(ownerCard.find(".community-view__rename-btn").exists()).toBe(true);
		expect(ownerCard.find(".community-view__visibility-btn").exists()).toBe(true);
		expect(ownerCard.find(".community-view__delete-btn").exists()).toBe(true);
		// não-dono não tem
		const otherCard = cards.find((c) => c.text().includes("De outro irmão"))!;
		expect(otherCard.find(".community-view__edit-btn").exists()).toBe(false);
		expect(otherCard.find(".community-view__delete-btn").exists()).toBe(false);
		w.unmount();
	});

	it("renomear inline chama updateCustomCollection(id, { name }) e recarrega", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: ITEMS.map((x) => ({ ...x })),
			page: 1,
			lastPage: 1,
			total: 2,
		});
		mocks.updateCustomCollection.mockResolvedValue({
			id: 9,
			name: "Renomeada",
			description: null,
			musicsCount: 3,
		});
		const w = await mountView();
		const ownerCard = w.findAll(".community-view__card").find((c) =>
			c.text().includes("Minha coletânea pública"),
		)!;
		await ownerCard.find(".community-view__rename-btn").trigger("click");
		await flushPromises();
		const input = ownerCard.find(".community-view__rename-input");
		expect(input.exists()).toBe(true);
		await input.setValue("Renomeada");
		await ownerCard.find(".community-view__rename-save").trigger("click");
		await flushPromises();
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(9, { name: "Renomeada" });
		w.unmount();
	});

	it("privar (dono) chama updateCustomCollection(id, { visibility: 'private' })", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: ITEMS.map((x) => ({ ...x })),
			page: 1,
			lastPage: 1,
			total: 2,
		});
		mocks.updateCustomCollection.mockResolvedValue({
			id: 9,
			name: "X",
			description: null,
			musicsCount: 3,
			visibility: "private",
		});
		const w = await mountView();
		const ownerCard = w.findAll(".community-view__card").find((c) =>
			c.text().includes("Minha coletânea pública"),
		)!;
		await ownerCard.find(".community-view__visibility-btn").trigger("click");
		await flushPromises();
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(9, {
			visibility: "private",
		});
		w.unmount();
	});

	it("excluir (dono) confirma e chama deleteCustomCollection(id)", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: ITEMS.map((x) => ({ ...x })),
			page: 1,
			lastPage: 1,
			total: 2,
		});
		mocks.deleteCustomCollection.mockResolvedValue(true);
		const w = await mountView();
		const ownerCard = w.findAll(".community-view__card").find((c) =>
			c.text().includes("Minha coletânea pública"),
		)!;
		await ownerCard.find(".community-view__delete-btn").trigger("click");
		await flushPromises();
		// confirmação inline antes de excluir
		expect(ownerCard.find(".community-view__delete-confirm").exists()).toBe(true);
		await ownerCard.find(".community-view__delete-yes").trigger("click");
		await flushPromises();
		expect(mocks.deleteCustomCollection).toHaveBeenCalledWith(9);
		w.unmount();
	});

	it("não-dono (deslogado): só copiar + report", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: ITEMS.map((x) => ({ ...x })),
			page: 1,
			lastPage: 1,
			total: 2,
		});
		const w = await mountView();
		for (const card of w.findAll(".community-view__card")) {
			expect(card.find(".community-view__edit-btn").exists()).toBe(false);
			expect(card.find(".community-view__rename-btn").exists()).toBe(false);
			expect(card.find(".community-view__delete-btn").exists()).toBe(false);
			expect(card.find(".community-view__copy-btn").exists()).toBe(true);
			expect(card.find(".community-view__report-btn").exists()).toBe(true);
		}
		w.unmount();
	});
});
