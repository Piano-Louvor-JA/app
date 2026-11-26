// @vitest-environment jsdom
// AC2/AC3 (SPEC-louvorja-community-copies): CommunityCopiesView lista
// SOMENTE cópias (origin.type==='community'), copiedAt DESC, com abrir/excluir.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

const mocks = vi.hoisted(() => ({
	push: vi.fn(async () => {}),
}));

vi.mock("vue-router", () => ({
	useRouter: () => ({ push: mocks.push, back: vi.fn() }),
	useRoute: () => ({ params: {}, query: {} }),
}));

vi.mock("@shared/composables/useMinimizablePage", () => ({
	useMinimizablePage: () => ({
		minimize: vi.fn(),
		prepare: vi.fn(),
		takeRestoredState: () => null,
	}),
}));

vi.mock("@design-system/index", () => ({
	GlassCard: {
		name: "GlassCard",
		template: "<div><slot /></div>",
	},
}));

import CommunityCopiesView from "../CommunityCopiesView.vue";
import {
	createLocalCollection,
	deleteLocalCollection,
	listLocalCollections,
} from "@modules/media/services/local-custom-store";
import { listCommunityCopies } from "@modules/media/services/community-copies";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: {
		"pt-BR": {
			community: {
				back: "Voltar",
				copies: {
					title: "Minhas cópias",
					subtitle: "Cópias de coletâneas da Comunidade",
					empty: "Você ainda não salvou cópias.",
					open: "Abrir",
					delete: "Excluir",
					badge: "Cópia",
				},
			},
		},
	},
});

// Store REAL (localStorage jsdom) via createLocalCollection + origin.
function seed(name: string, copiedAt: string, collectionId: number) {
	return createLocalCollection(name, undefined, {
		type: "community",
		collectionId,
		copiedAt,
	});
}

describe("CommunityCopiesView (AC2/AC3)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("renderiza a cópia com nome + badge; manual NÃO aparece", async () => {
		seed("Cópia Culto Jovem", "2026-11-23T12:00:00.000Z", 42);
		createLocalCollection("Minha coletânea manual");

		const wrapper = mount(CommunityCopiesView, { global: { plugins: [i18n] } });
		await flushPromises();

		const text = wrapper.text();
		expect(text).toContain("Cópia Culto Jovem");
		expect(text).not.toContain("Minha coletânea manual");
		expect(text).toContain("Cópia"); // badge
	});

	it("ordena copiedAt DESC", async () => {
		seed("Antiga", "2026-01-01T00:00:00.000Z", 1);
		seed("Recente", "2026-11-23T00:00:00.000Z", 2);

		const wrapper = mount(CommunityCopiesView, { global: { plugins: [i18n] } });
		await flushPromises();

		const names = wrapper.findAll(".community-copies-view__name").map((n) => n.text());
		expect(names).toEqual(["Recente", "Antiga"]);
	});

	it("excluir remove do store", async () => {
		const copy = seed("Cópia", "2026-11-23T12:00:00.000Z", 9);

		const wrapper = mount(CommunityCopiesView, { global: { plugins: [i18n] } });
		await flushPromises();

		await wrapper.find(".community-copies-view__delete").trigger("click");
		expect(listLocalCollections().find((c) => c.id === copy.id)).toBeUndefined();
	});

	it("abrir navega para community/copies/:id", async () => {
		const copy = seed("Cópia", "2026-11-23T12:00:00.000Z", 9);

		const wrapper = mount(CommunityCopiesView, { global: { plugins: [i18n] } });
		await flushPromises();

		await wrapper.find(".community-copies-view__open").trigger("click");
		expect(mocks.push).toHaveBeenCalledWith(`/community/copies/${copy.id}`);
	});

	it("empty-state quando não há cópias", async () => {
		const wrapper = mount(CommunityCopiesView, { global: { plugins: [i18n] } });
		await flushPromises();
		expect(wrapper.text()).toContain("Você ainda não salvou cópias.");
	});

	it("listCommunityCopies (fonte real) reflete o store", () => {
		seed("Cópia", "2026-11-23T12:00:00.000Z", 5);
		createLocalCollection("Manual");
		expect(listCommunityCopies()).toHaveLength(1);
		expect(deleteLocalCollection(listLocalCollections()[0]!.id)).toBe(true);
	});
});
