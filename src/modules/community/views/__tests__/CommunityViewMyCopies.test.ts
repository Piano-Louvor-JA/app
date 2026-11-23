// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

// Adendo v1.1.0: "Minhas Cópias" virou VIEW PRÓPRIA
// (MyCommunityCopiesView, rota /community/copies) — o teste acompanha.
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
		deleteCustomCollection: vi.fn(async () => true),
		routerBack: vi.fn(),
		routerPush: vi.fn(),
	};
});

vi.mock("@modules/media/services/custom-catalog", () => ({
	deleteCustomCollection: mocks.deleteCustomCollection,
	listCustomCollections: vi.fn(async () => []),
	toCustomCollectionId: (id: number) => id + 2_000_000,
}));
vi.mock("@modules/media/services/local-custom-store", () => ({
	listLocalCollections: mocks.listLocalCollections,
	listLocalMusics: mocks.listLocalMusics,
}));
vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: () => null,
}));
vi.mock("@design-system/index", () => ({
	GlassCard: {
		name: "GlassCard",
		template: '<div class="glass-card-mock"><slot /></div>',
	},
}));
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: mocks.routerPush, back: mocks.routerBack }),
	useRoute: () => ({ name: "community-copies" }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import MyCommunityCopiesView from "../MyCommunityCopiesView.vue";

beforeEach(() => {
	vi.clearAllMocks();
	setActivePinia(createPinia());
});

describe("MyCommunityCopiesView — cópias salvas da Comunidade", () => {
	it("lista só cópias com origin.type='community', ordenadas por createdAt desc", async () => {
		const w = mount(MyCommunityCopiesView);
		await flushPromises();

		const titles = w.findAll("h3").map((h) => h.text());
		expect(titles).toEqual(["Cópia Teste", "Cópia mais antiga"]);
	});

	it("clique no card navega para community-copy com o id local CRU", async () => {
		const w = mount(MyCommunityCopiesView);
		await flushPromises();

		await w
			.findAll('[data-test="community-copy-card"]')[0]!
			.trigger("click");

		expect(mocks.routerPush).toHaveBeenCalledWith({
			name: "community-copy",
			params: { collectionId: String(-7) },
		});
	});

	it("não renderiza card quando não há cópias", async () => {
		mocks.listLocalCollections.mockReturnValueOnce([]);
		const w = mount(MyCommunityCopiesView);
		await flushPromises();

		expect(
			w.find('[data-test="community-copy-card"]').exists(),
		).toBe(false);
	});

	it("delete confirmado exclui a cópia local e remove o card", async () => {
		const w = mount(MyCommunityCopiesView);
		await flushPromises();

		await w
			.findAll('[data-test="community-copy-delete"]')[0]!
			.trigger("click");
		await flushPromises();

		await w
			.find('[data-test="community-copy-delete-confirm"]')
			.find(".my-copies-view__delete-yes")
			.trigger("click");
		await flushPromises();

		expect(mocks.deleteCustomCollection).toHaveBeenCalledWith(-7);
		const titles = w.findAll("h3").map((h) => h.text());
		expect(titles).toEqual(["Cópia mais antiga"]);
	});
});
