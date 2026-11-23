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
			items: [
				{
					id: 42,
					name: "Coletânea Comunidade",
					description: null,
					coverUrl: null,
					authorName: "João",
					musicsCount: 3,
					updatedAt: null,
					ownerId: 999,
					visibility: "public",
				},
			],
			page: 1,
			lastPage: 1,
			total: 1,
		})),
		getWeeklyTasks: vi.fn(async () => null),
		getSeasonalEvent: vi.fn(async () => null),
		saveCommunityCopy: vi.fn(async () => -7),
		reportCollection: vi.fn(async () => true),
		registerUse: vi.fn(async () => true),
		listLocalCollections: vi.fn(() => []),
		listLocalMusics: vi.fn(() => []),
		routerBack: vi.fn(),
		routerPush: vi.fn(),
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
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import CommunityView from "../CommunityView.vue";

beforeEach(() => {
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
	setActivePinia(createPinia());
	vi.clearAllMocks();
	mocks.getAuthReadiness.mockResolvedValue(null);
	mocks.getNotifications.mockResolvedValue([]);
	mocks.getSession.mockReturnValue({ token: "tok-123", user: { id_user: 4 } });
});

async function mountView() {
	const wrapper = mount(CommunityView);
	await flushPromises();
	await flushPromises();
	return wrapper;
}

describe("RF-01 — card da Comunidade abre detalhe", () => {
	it("card NÃO-dono expõe botão 'Abrir coletânea' que navega para o detalhe", async () => {
		const wrapper = await mountView();
		const openBtn = wrapper.find('[data-test="community-open-collection"]');
		expect(openBtn.exists()).toBe(true);
		await openBtn.trigger("click");
		expect(mocks.routerPush).toHaveBeenCalledWith({
			name: "community-collection",
			params: { collectionId: 42 },
		});
	});

	it("ação abrir é botão nativo acessível por teclado", async () => {
		const wrapper = await mountView();
		const openButton = wrapper.find('[data-test="community-open-collection"]');
		expect(openButton.element.tagName).toBe("BUTTON");
		expect(openButton.attributes("type")).toBe("button");
	});
});

describe("RF-03 — cópia leva ao destino inequívoco", () => {
	it("cópia com id local navega para /albums/:collectionId com o id da cópia", async () => {
		mocks.saveCommunityCopy.mockResolvedValue(-7);
		const wrapper = await mountView();
		await wrapper
			.find('[data-test="community-copy-btn"]')
			.trigger("click");
		await flushPromises();
		expect(mocks.saveCommunityCopy).toHaveBeenCalled();
		expect(mocks.routerPush).toHaveBeenCalledWith({
			name: "albums-collection",
			params: { collectionId: "1999993" },
		});
	});

	it("cópia que falha (null) NÃO navega e mostra erro", async () => {
		mocks.saveCommunityCopy.mockResolvedValue(null);
		const wrapper = await mountView();
		await wrapper
			.find('[data-test="community-copy-btn"]')
			.trigger("click");
		await flushPromises();
		expect(mocks.routerPush).not.toHaveBeenCalled();
		expect(wrapper.find('[data-test="community-copy-error"]').exists()).toBe(
			true,
		);
	});
});
