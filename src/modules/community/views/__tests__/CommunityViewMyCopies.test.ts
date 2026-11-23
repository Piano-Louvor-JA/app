// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

// Composable testado à parte: aqui só o contrato tela ↔ minimizar.
const minimizeMock = vi.fn(async () => {});
const prepareMock = vi.fn();
vi.mock("@shared/composables/useMinimizablePage", () => ({
	useMinimizablePage: () => ({
		minimize: minimizeMock,
		prepare: prepareMock,
		takeRestoredState: () => null,
	}),
}));

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => {
	return {
		getNotifications: vi.fn(async () => []),
		markAllRead: vi.fn(async () => undefined),
		listCommunityCollectionsPage: vi.fn(async () => ({
			items: [],
			page: 1,
			lastPage: 1,
			total: 0,
		})),
		getWeeklyTasks: vi.fn(async () => null),
		getSeasonalEvent: vi.fn(async () => null),
		saveCommunityCopy: vi.fn(async () => -7),
		reportCollection: vi.fn(async () => true),
		registerUse: vi.fn(async () => true),
		listLocalCollections: vi.fn(() => [
			{
				id: -7,
				name: "Cópia Teste",
				createdAt: "2026-11-20T10:00:00.000Z",
				origin: { type: "community", sourceId: 42 },
			},
			{
				id: -3,
				name: "Local comum (sem origem)",
				createdAt: "2026-11-21T10:00:00.000Z",
			},
			{
				id: -9,
				name: "Cópia mais antiga",
				createdAt: "2026-11-19T10:00:00.000Z",
				origin: { type: "community", sourceId: 1 },
			},
		]),
		listLocalMusics: vi.fn(() => [{ id: -100, name: "x" }]),
		routerBack: vi.fn(),
		routerPush: vi.fn(),
		routeName: "community" as string | null,
		getSession: vi.fn(() => ({ token: "tok-123", user: { id_user: 4 } })),
		getAuthReadiness: vi.fn(() => Promise.resolve<unknown>(null)),
	};
});

vi.mock("../../services/notifications", () => ({
	getNotifications: mocks.getNotifications,
	markAllRead: mocks.markAllRead,
}));
vi.mock("../../services/community-catalog", () => ({
	listCommunityCollectionsPage: mocks.listCommunityCollectionsPage,
	saveCommunityCopy: mocks.saveCommunityCopy,
	sortByRecentFirst: (xs: unknown[]) => xs,
}));
vi.mock("../../services/weekly-tasks", () => ({
	getWeeklyTasks: mocks.getWeeklyTasks,
	completeWeeklyTask: vi.fn(),
}));
vi.mock("../../services/ranking", () => ({
	getRanking: vi.fn(async () => ({ data: [] })),
	registerUse: mocks.registerUse,
	reportCollection: mocks.reportCollection,
}));
vi.mock("../../services/seasonal-event", () => ({
	getSeasonalEvent: mocks.getSeasonalEvent,
}));
vi.mock("../../services/blocks", () => ({
	blockAuthor: vi.fn(async () => true),
	listBlockedAuthors: vi.fn(async () => []),
	unblockAuthor: vi.fn(async () => true),
}));
vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: mocks.getSession,
	authTokenAsync: async () => mocks.getSession()?.token ?? null,
}));
vi.mock("@modules/auth/services/firebase-client", () => ({
	getAuthReadiness: mocks.getAuthReadiness,
}));
vi.mock("@modules/media/services/custom-catalog", () => ({
	updateCustomCollection: vi.fn(async () => null),
	deleteCustomCollection: vi.fn(async () => false),
	listCustomCollections: vi.fn(async () => []),
	toCustomCollectionId: (id: number) => id + 2_000_000,
}));
vi.mock("@modules/media/services/local-custom-store", () => ({
	listLocalCollections: mocks.listLocalCollections,
	listLocalMusics: mocks.listLocalMusics,
}));
vi.mock("@modules/community-edits/services/local-edits-store", () => ({
	listLocalEdits: vi.fn(() => []),
}));
vi.mock("@modules/community-edits/services/publish-edit", () => ({
	publishEdit: vi.fn(async () => true),
}));
vi.mock("@design-system/index", () => ({
	GlassCard: {
		name: "GlassCard",
		template: '<div class="glass-card-mock"><slot /></div>',
	},
}));
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: mocks.routerPush, back: mocks.routerBack }),
	useRoute: () => ({ name: mocks.routeName }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import CommunityView from "../CommunityView.vue";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.routeName = "community";
	setActivePinia(createPinia());
});

describe("CommunityView — seção Minhas Cópias", () => {
	it("lista só cópias com origin.type='community', ordenadas por createdAt desc", async () => {
		const w = mount(CommunityView);
		await flushPromises();

		const section = w.find('[data-test="community-my-copies"]');
		expect(section.exists()).toBe(true);

		const titles = section.findAll("h3").map((h) => h.text());
		expect(titles).toEqual(["Cópia Teste", "Cópia mais antiga"]);
	});

	it("clique no card navega para community-copy com o id local CRU", async () => {
		const w = mount(CommunityView);
		await flushPromises();

		await w
			.findAll('[data-test="community-copy-card"]')[0]
			.trigger("click");

		expect(mocks.routerPush).toHaveBeenCalledWith({
			name: "community-copy",
			params: { collectionId: String(-7) },
		});
	});

	it("não renderiza a seção quando não há cópias", async () => {
		mocks.listLocalCollections.mockReturnValueOnce([]);
		const w = mount(CommunityView);
		await flushPromises();

		expect(w.find('[data-test="community-my-copies"]').exists()).toBe(false);
	});
});
