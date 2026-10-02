// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

// vi.mock é HOISTED: refs aos mocks precisam de vi.hoisted
const mocks = vi.hoisted(() => {
	return {
		getRanking: vi.fn(async () => [] as unknown[]),
		getMyPosition: vi.fn(async () => null),
		getSession: vi.fn(() => null as null | { token: string }),
		routerPush: vi.fn(),
	};
});

vi.mock("../../services/ranking", () => ({
	getRanking: mocks.getRanking,
	getMyPosition: mocks.getMyPosition,
	registerUse: vi.fn(),
	reportCollection: vi.fn(),
}));
vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: mocks.getSession,
}));
vi.mock("@design-system/index", () => ({
	GlassCard: {
		name: "GlassCard",
		template: '<div class="glass-card-mock"><slot /></div>',
	},
}));
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: mocks.routerPush }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string, params?: Record<string, unknown>) => (params ? `${k} ${JSON.stringify(params)}` : k), locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import RankingView from "../RankingView.vue";

const ENTRIES = [
	{ user_id: 7, position: 1, display_name: "Elias", total: 120 },
	{ user_id: 9, position: 2, display_name: "Maria", total: 80 },
];

async function mountView() {
	const wrapper = mount(RankingView);
	await flushPromises();
	return wrapper;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getSession.mockReturnValue(null);
	mocks.getRanking.mockResolvedValue([]);
	mocks.getMyPosition.mockResolvedValue(null);
});

describe("RankingView", () => {
	it("carrega ranking e posição ao montar (window all)", async () => {
		mocks.getSession.mockReturnValue({ token: "tok-9" });
		mocks.getRanking.mockResolvedValue(ENTRIES as never);
		mocks.getMyPosition.mockResolvedValue({ position: 2, total: 80 });
		const wrapper = await mountView();

		expect(mocks.getRanking).toHaveBeenCalledWith("all");
		expect(mocks.getMyPosition).toHaveBeenCalledWith("all", "tok-9");
		const rows = wrapper.findAll(".ranking-view__row");
		expect(rows).toHaveLength(2);
		expect(rows[0].text()).toContain("Elias");
		expect(rows[0].text()).toContain("120"); // via params interpolados no t mock
	});

	it("sem sessão: getMyPosition recebe null token e mostra convite de login", async () => {
		mocks.getRanking.mockResolvedValue(ENTRIES as never);
		const wrapper = await mountView();

		expect(mocks.getMyPosition).toHaveBeenCalledWith("all", null);
		// card "me": v-else-if="!isLoading" do login
		expect(wrapper.text()).toContain("ranking.loginToSeePosition");
	});

	it("logado sem posição: mostra notRankedYet (me null)", async () => {
		mocks.getSession.mockReturnValue({ token: "tok-9" });
		mocks.getMyPosition.mockResolvedValue(null);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("ranking.notRankedYet");
	});

	it("logado com posição null no servidor: mostra notRankedYet (branch position !== null)", async () => {
		mocks.getSession.mockReturnValue({ token: "tok-9" });
		mocks.getMyPosition.mockResolvedValue({ position: null, total: null });
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("ranking.notRankedYet");
	});

	it("logado com posição: mostra myPosition + pontos", async () => {
		mocks.getSession.mockReturnValue({ token: "tok-9" });
		mocks.getMyPosition.mockResolvedValue({ position: 2, total: 80 });
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("ranking.myPosition");
		expect(wrapper.text()).toContain("80");
	});

	it("troca de janela (week) recarrega com novo window", async () => {
		const wrapper = await mountView();
		mocks.getRanking.mockClear();
		mocks.getMyPosition.mockClear();

		const tabs = wrapper.findAll(".ranking-view__tab");
		await tabs[0].trigger("click"); // week
		await flushPromises();

		expect(mocks.getRanking).toHaveBeenCalledWith("week");
		// token vem da MESMA sessão (getAuthSession chamado de novo no load)
		expect(mocks.getSession).toHaveBeenCalled();
	});

	it("clicar em 'todos' após 'semana' volta pra all", async () => {
		const wrapper = await mountView();
		const tabs = wrapper.findAll(".ranking-view__tab");
		await tabs[0].trigger("click");
		await flushPromises();
		await tabs[1].trigger("click"); // all
		await flushPromises();
		expect(mocks.getRanking).toHaveBeenLastCalledWith("all");
	});

	it("lista vazia: mostra ranking.empty", async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("ranking.empty");
		expect(wrapper.findAll(".ranking-view__row")).toHaveLength(0);
	});

	it("campeão (position 1) recebe classes top + troféu", async () => {
		mocks.getRanking.mockResolvedValue(ENTRIES as never);
		const wrapper = await mountView();
		const top = wrapper.findAll(".ranking-view__row")[0];
		expect(top.classes()).toContain("ranking-view__row--top");
		expect(top.find(".ti-trophy").exists()).toBe(true);
	});

	it("não-campeão não tem troféu nem classe top", async () => {
		mocks.getRanking.mockResolvedValue(ENTRIES as never);
		const wrapper = await mountView();
		const second = wrapper.findAll(".ranking-view__row")[1];
		expect(second.classes()).not.toContain("ranking-view__row--top");
		expect(second.find(".ti-trophy").exists()).toBe(false);
		expect(second.find(".ti-user").exists()).toBe(true);
	});

	it("botão voltar navega pra /community", async () => {
		const wrapper = await mountView();
		await wrapper.find(".ranking-view__back").trigger("click");
		expect(mocks.routerPush).toHaveBeenCalledWith("/community");
	});

	it("estado de loading aparece antes do fetch resolver", async () => {
		let resolveRanking!: (v: unknown) => void;
		mocks.getRanking.mockReturnValue(
			new Promise((resolve) => {
				resolveRanking = resolve;
			}) as never,
		);
		const wrapper = mount(RankingView);
		expect(wrapper.find(".ranking-view__status").text()).toContain(
			"community.loading",
		);
		resolveRanking([]);
		await flushPromises();
	});
});

describe("RankingView — branch me.total null → 0", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("logado com posição mas total null: mostra 0 pontos (?? 0)", async () => {
		mocks.getSession.mockReturnValue({ token: "tok-9" });
		mocks.getMyPosition.mockResolvedValue({ position: 4, total: null });
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("ranking.myPosition");
		// total null → 0 via ?? 0
		const pts = wrapper.find(".ranking-view__me-points");
		expect(pts.exists()).toBe(true);
		expect(pts.text()).toContain("0");
	});
});
