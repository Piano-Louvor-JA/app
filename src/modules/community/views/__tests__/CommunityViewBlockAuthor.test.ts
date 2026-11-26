// @vitest-environment jsdom
// App Store 1.2: bloquear autor na Comunidade (paridade apk/web).
// Não-dono vê "bloquear autor"; confirma pelo AppConfirm; a API filtra.
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
	blockAuthor: vi.fn(async () => ({ id: 12, name: "Autor" })),
	confirm: vi.fn(async () => true),
}));

vi.mock("../../services/blocks", () => ({
	blockAuthor: mocks.blockAuthor,
	listBlockedAuthors: vi.fn(async () => []),
	unblockAuthor: vi.fn(async () => true),
}));
vi.mock("@shared/composables/useAppConfirm", () => ({
	appConfirm: mocks.confirm,
}));
vi.mock("../../components/BlockedAuthorsDialog.vue", () => ({
	default: {
		name: "BlockedAuthorsDialog",
		props: ["open"],
		emits: ["close"],
		template: '<div v-if="open" data-test="blocked-dialog-mock" />',
	},
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
	listLocalCollections: vi.fn(() => []),
	listLocalMusics: vi.fn(() => []),
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
	useRoute: () => ({ name: "community" }),
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

describe("CommunityView — bloquear autor (App Store 1.2)", () => {
	function otherCard(w: Awaited<ReturnType<typeof mountView>>) {
		return w.findAll(".community-view__card").find((c) => c.text().includes("De outro irmão"))!;
	}
	function ownCard(w: Awaited<ReturnType<typeof mountView>>) {
		return w.findAll(".community-view__card").find((c) => c.text().includes("Minha coletânea pública"))!;
	}

	it("só o cartão de outro autor tem o botão de bloquear", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		const w = await mountView();
		expect(otherCard(w).find('[data-test="community-block-author"]').exists()).toBe(true);
		expect(ownCard(w).find('[data-test="community-block-author"]').exists()).toBe(false);
		w.unmount();
	});

	it("confirma, bloqueia o dono da coletânea e recarrega a lista", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		const w = await mountView();
		const loads = mocks.listCommunityCollectionsPage.mock.calls.length;
		await otherCard(w).find('[data-test="community-block-author"]').trigger("click");
		await flushPromises();
		expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, title: "community.blockConfirmTitle" }));
		expect(mocks.blockAuthor).toHaveBeenCalledWith(10, "tok");
		expect(mocks.listCommunityCollectionsPage.mock.calls.length).toBeGreaterThan(loads);
		expect(w.text()).toContain("community.blockDone");
		w.unmount();
	});

	it("cancelar a confirmação não bloqueia", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.confirm.mockResolvedValueOnce(false);
		const w = await mountView();
		await otherCard(w).find('[data-test="community-block-author"]').trigger("click");
		await flushPromises();
		expect(mocks.blockAuthor).not.toHaveBeenCalled();
		w.unmount();
	});

	it("falha da API avisa o erro", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		mocks.blockAuthor.mockResolvedValueOnce(null);
		const w = await mountView();
		await otherCard(w).find('[data-test="community-block-author"]').trigger("click");
		await flushPromises();
		expect(w.text()).toContain("community.blockFailed");
		w.unmount();
	});

	it("sem login pede para entrar e não abre confirmação", async () => {
		mocks.getSession.mockReturnValue(null);
		const w = await mountView();
		await otherCard(w).find('[data-test="community-block-author"]').trigger("click");
		await flushPromises();
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(w.text()).toContain("community.loginToModerate");
		w.unmount();
	});

	it("logado vê o atalho de usuários bloqueados, que abre o diálogo", async () => {
		mocks.getSession.mockReturnValue(SESSION);
		const w = await mountView();
		const btn = w.find('[data-test="community-blocked-users"]');
		expect(btn.exists()).toBe(true);
		await btn.trigger("click");
		expect(w.find('[data-test="blocked-dialog-mock"]').exists()).toBe(true);
		w.findComponent({ name: "BlockedAuthorsDialog" }).vm.$emit("close", true);
		await flushPromises();
		expect(w.find('[data-test="blocked-dialog-mock"]').exists()).toBe(false);
		w.unmount();
	});
});
