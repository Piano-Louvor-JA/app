// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
	getDetail: vi.fn(),
	openMusicPlayer: vi.fn(async () => ({ ok: true })),
	routerBack: vi.fn(),
	paramId: "42",
}));

vi.mock("../../services/community-catalog", () => ({
	getCommunityCollectionDetail: mocks.getDetail,
}));
vi.mock("@modules/media/services/open-music-player", () => ({
	openMusicPlayer: mocks.openMusicPlayer,
}));
vi.mock("@design-system/index", () => ({
	GlassCard: { template: "<div><slot /></div>" },
}));
vi.mock("@shared/components/PageBackStack.vue", () => ({
	default: { template: "<div><slot /></div>" },
}));
vi.mock("vue-router", () => ({
	useRoute: () => ({ params: { collectionId: mocks.paramId } }),
	useRouter: () => ({ back: mocks.routerBack }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values?.name ? `${key}:${values.name}` : key }),
}));

import CommunityCollectionView from "../CommunityCollectionView.vue";

const DETAIL = {
	id: 42,
	name: "Culto Jovem",
	description: "Louvor sacro",
	authorName: "Maria",
	coverUrl: null,
	musics: [
		{ id: 7, name: "Com áudio", audioUrl: "/audio.mp3", officialMusicId: 123, hasAudio: true },
		{ id: 8, name: "Sem áudio", audioUrl: null, officialMusicId: null, hasAudio: false },
	],
};

async function mountView() {
	const wrapper = mount(CommunityCollectionView);
	await flushPromises();
	return wrapper;
}

describe("CommunityCollectionView — RF-02", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.paramId = "42";
		mocks.getDetail.mockResolvedValue(DETAIL);
	});

	it("mostra nome, autor e faixas retornadas", async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("Culto Jovem");
		expect(wrapper.find('.community-collection-view__header p').exists()).toBe(true);
		expect(wrapper.text()).toContain("Com áudio");
		expect(wrapper.text()).toContain("Sem áudio");
	});

	it("faixa reproduzível abre o player existente sem projetar", async () => {
		const wrapper = await mountView();
		await wrapper.findAll("button").find((b) => b.text().includes("community.play"))?.trigger("click");
		expect(mocks.openMusicPlayer).toHaveBeenCalledWith({
			musicId: 123,
			mode: "audio",
			project: false,
		});
	});

	it("faixa sem áudio não oferece ação de ouvir e sinaliza indisponibilidade", async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("community.trackUnavailable");
		expect(wrapper.findAll("button").filter((b) => b.text().includes("community.play"))).toHaveLength(1);
	});

	it("detalhe inexistente/privado mostra erro e retry", async () => {
		mocks.getDetail.mockResolvedValue(null);
		const wrapper = await mountView();
		expect(wrapper.find('[role="alert"]').exists()).toBe(true);
		expect(wrapper.text()).toContain("community.collectionLoadError");
	});
});
