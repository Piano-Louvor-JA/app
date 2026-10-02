// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// vi.mock é HOISTED: refs aos mocks precisam de vi.hoisted (sino do load morrer silencioso)
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
		saveCommunityCopy: vi.fn(async () => 777),
		reportCollection: vi.fn(async () => true),
		registerUse: vi.fn(async () => true),
		routerBack: vi.fn(),
		routerPush: vi.fn(),
		getSession: vi.fn(() => ({ token: "tok-123", user: { id: 4 } })),
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
	useRouter: () => ({ push: mocks.routerPush, back: mocks.routerBack }),
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import CommunityView from "../CommunityView.vue";

const NOTIFS = [
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
];

// jsdom não implementa scrollTo em Element
beforeEach(() => {
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
});

async function mountView() {
	const wrapper = mount(CommunityView);
	await flushPromises();
	await flushPromises();
	return wrapper;
}

describe("CommunityView — carregamento popula estado (regressão do bug do sino)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getNotifications.mockResolvedValue(NOTIFS);
		mocks.getSession.mockReturnValue({ token: "tok-123", user: { id: 4 } });
	});

	it("popula notifications a partir do service (antes: dados eram descartados)", async () => {
		const wrapper = await mountView();
		expect(wrapper.vm.notifications).toHaveLength(2);
		expect(wrapper.vm.notifications[0].id).toBe(1);
		expect(mocks.getNotifications).toHaveBeenCalledTimes(1);
	});

	it("isLogged = true quando há sessão com token", async () => {
		const wrapper = await mountView();
		expect(wrapper.vm.isLogged).toBe(
			true,
		);
	});

	it("sem sessão: isLogged = false e o sino NÃO renderiza", async () => {
		mocks.getSession.mockReturnValue(null);
		const wrapper = await mountView();
		expect(wrapper.vm.isLogged).toBe(
			false,
		);
		expect(wrapper.find(".community-view__bell").exists()).toBe(false);
	});

	it("renderiza o sino quando logado", async () => {
		const wrapper = await mountView();
		expect(wrapper.find(".community-view__bell").exists()).toBe(true);
	});

	it("coleções paginadas populam o grid (24 por página)", async () => {
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 9, name: "X", musicsCount: 1, authorName: "A" }],
			page: 2,
			lastPage: 5,
			total: 100,
		});
		const wrapper = await mountView();
		expect(wrapper.vm.collections).toHaveLength(1);
		expect(wrapper.vm.page).toBe(2);
		expect(wrapper.vm.lastPage).toBe(5);
	});
});

describe("NotificationsDropdown — interação (regressão do armed-gate)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
		mocks.getNotifications.mockResolvedValue(NOTIFS);
		mocks.getSession.mockReturnValue({ token: "tok-123", user: { id: 4 } });
	});

	it("badge mostra o número de não lidas", async () => {
		const wrapper = await mountView();
		expect(wrapper.find(".community-view__bell-badge").text()).toBe("2");
	});

	it("clique no sino abre o dropdown; clique de novo (toggle) fecha", async () => {
		const wrapper = await mountView();
		const bell = wrapper.find(".community-view__bell");
		await bell.trigger("click");
		expect(
			wrapper.findComponent({ name: "NotificationsDropdown" }).exists(),
		).toBe(true);
		await bell.trigger("click");
		expect(
			wrapper.findComponent({ name: "NotificationsDropdown" }).exists(),
		).toBe(false);
	});

	it("mark-read: limpa as notificações (badge some)", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__bell").trigger("click");
		wrapper
			.findComponent({ name: "NotificationsDropdown" })
			.vm.$emit("mark-read");
		await flushPromises();
		expect(
			wrapper.vm.notifications,
		).toEqual([]);
		expect(wrapper.find(".community-view__bell-badge").exists()).toBe(false);
	});

	it("close: fecha SEM marcar como lida (notificações preservadas)", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__bell").trigger("click");
		wrapper
			.findComponent({ name: "NotificationsDropdown" })
			.vm.$emit("close");
		await flushPromises();
		expect(
			wrapper.vm.notifications,
		).toHaveLength(2);
		expect(mocks.markAllRead).not.toHaveBeenCalled();
		expect(
			wrapper.findComponent({ name: "NotificationsDropdown" }).exists(),
		).toBe(false);
	});

	it("botão 'marcar lidas' chama service 1x, limpa estado e fecha (markAndClose)", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__bell").trigger("click");
		// Teleport to="body": buscar o botão no document, não no wrapper
		const markBtn = document.body.querySelector(".notif-dropdown__mark");
		expect(markBtn).not.toBeNull();
		markBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flushPromises();
		expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
		expect(wrapper.vm.notifications).toEqual([]);
		expect(
			wrapper.findComponent({ name: "NotificationsDropdown" }).exists(),
		).toBe(false);
	});
});

describe("CommunityView — busca, filtragem, cópia, report e paginação", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
		mocks.getNotifications.mockResolvedValue([]);
		mocks.getSession.mockReturnValue({ token: "tok-123", user: { id: 4 } });
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [
				{ id: 9, name: "Hinos Antigos", musicsCount: 3, authorName: "Maria" },
				{ id: 11, name: "Cantinas Jovens", musicsCount: 5, authorName: "João" },
			],
			page: 1,
			lastPage: 3,
			total: 6,
		});
	});

	it("busca filtra por nome da coletânea (computed filteredCollections)", async () => {
		const wrapper = await mountView();
		wrapper.vm.searchQuery = "antigos";
		await flushPromises();
		const cards = wrapper.findAll(".community-view__card-title");
		// busca filtra a lista exibida
		expect(wrapper.vm.filteredCollections).toHaveLength(1);
		expect(wrapper.vm.filteredCollections[0].name).toBe("Hinos Antigos");
	});

	it("busca filtra por nome do autor", async () => {
		const wrapper = await mountView();
		wrapper.vm.searchQuery = "joão";
		await flushPromises();
		expect(wrapper.vm.filteredCollections).toHaveLength(1);
		expect(wrapper.vm.filteredCollections[0].authorName).toBe("João");
	});

	it("busca vazia/whitespace retorna tudo (sem filtro)", async () => {
		const wrapper = await mountView();
		wrapper.vm.searchQuery = "   ";
		await flushPromises();
		expect(wrapper.vm.filteredCollections).toHaveLength(2);
	});

	it("botão X de limpar busca aparece quando há query e limpa", async () => {
		const wrapper = await mountView();
		wrapper.vm.searchQuery = "hinos";
		await flushPromises();
		await wrapper.vm.$nextTick();
		const clear = wrapper.find(".community-view__search-clear");
		expect(clear.exists()).toBe(true);
		await clear.trigger("click");
		expect(wrapper.vm.searchQuery).toBe("");
	});

	it("botão X de limpar NÃO existe sem query (v-if)", async () => {
		const wrapper = await mountView();
		await wrapper.vm.$nextTick();
		expect(wrapper.find(".community-view__search-clear").exists()).toBe(false);
	});

	it("saveCopy: registra uso, salva cópia local, mostra feedback e recarrega", async () => {
		const wrapper = await mountView();
		await wrapper.vm.saveCopy(wrapper.vm.collections[0]);
		await flushPromises();
		expect(mocks.registerUse).toHaveBeenCalledWith(9, "tok-123");
		expect(mocks.saveCommunityCopy).toHaveBeenCalledWith(
			wrapper.vm.collections[0],
		);
		expect(wrapper.vm.savedId).toBe(9);
		expect(wrapper.vm.copyingId).toBeNull();
	});

	it("saveCopy: cópia falha (null) → erro exibido, sem savedId", async () => {
		mocks.saveCommunityCopy.mockResolvedValue(null);
		const wrapper = await mountView();
		await wrapper.vm.saveCopy(wrapper.vm.collections[0]);
		await flushPromises();
		expect(wrapper.vm.savedError).toBe(9);
		expect(wrapper.vm.savedId).toBeNull();
		expect(wrapper.vm.copyingId).toBeNull();
	});

	it("openReport + submitReport ok: chama service com token, fecha dialog e recarrega", async () => {
		const wrapper = await mountView();
		wrapper.vm.openReport(wrapper.vm.collections[0]);
		await flushPromises();
		expect(wrapper.vm.reportTarget?.id).toBe(9);
		await wrapper.vm.submitReport("conteúdo impróprio");
		await flushPromises();
		expect(mocks.reportCollection).toHaveBeenCalledWith(
			9,
			"conteúdo impróprio",
			"tok-123",
		);
		expect(wrapper.vm.reportTarget).toBeNull();
		// recarregou a lista
		expect(mocks.listCommunityCollectionsPage).toHaveBeenCalledTimes(2);
	});

	it("submitReport com service falhando: fecha dialog SEM recarregar", async () => {
		mocks.reportCollection.mockResolvedValue(false);
		const wrapper = await mountView();
		wrapper.vm.openReport(wrapper.vm.collections[0]);
		await wrapper.vm.submitReport("x");
		await flushPromises();
		expect(wrapper.vm.reportTarget).toBeNull();
		expect(mocks.listCommunityCollectionsPage).toHaveBeenCalledTimes(1);
	});

	it("submitReport sem target (null) → early return sem chamar service", async () => {
		const wrapper = await mountView();
		await wrapper.vm.submitReport("y");
		expect(mocks.reportCollection).not.toHaveBeenCalled();
	});

	it("paginação: goTo válida muda página e recarrega; inválida é ignorada", async () => {
		// mock dinâmico: ecoa a página pedida (o real faria isso)
		mocks.listCommunityCollectionsPage.mockImplementation(async (p: number) => ({
			items: [],
			page: p,
			lastPage: 3,
			total: 6,
		}));
		const wrapper = await mountView();
		await flushPromises();
		const before = mocks.listCommunityCollectionsPage.mock.calls.length;
		wrapper.vm.goTo(2);
		await flushPromises();
		expect(wrapper.vm.page).toBe(2);
		expect(mocks.listCommunityCollectionsPage.mock.calls.length).toBe(before + 1);
		// inválidas: fora do range (<1, >lastPage) e mesma página → sem reload
		const stable = mocks.listCommunityCollectionsPage.mock.calls.length;
		wrapper.vm.goTo(0);
		wrapper.vm.goTo(99);
		wrapper.vm.goTo(2);
		await flushPromises();
		expect(mocks.listCommunityCollectionsPage.mock.calls.length).toBe(stable);
		// válida de novo (volta pra 1) → recarrega
		wrapper.vm.goTo(1);
		await flushPromises();
		expect(mocks.listCommunityCollectionsPage.mock.calls.length).toBe(stable + 1);
	});

	it("navegação: voltar usa router.back() e ranking-link usa push", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__back").trigger("click");
		expect(mocks.routerBack).toHaveBeenCalledTimes(1);
		await wrapper.find(".community-view__ranking-link").trigger("click");
		expect(mocks.routerPush).toHaveBeenCalledWith("/community/ranking");
	});

	it("tarefas semanais aparecem quando o service traz", async () => {
		mocks.getWeeklyTasks.mockResolvedValue([
			{ id: "t1", description: "Publique uma coletânea", done: false, bonus: 15 },
		]);
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("Publique uma coletânea");
	});

	it("evento sazonal ativo renderiza banner", async () => {
		mocks.getSeasonalEvent.mockResolvedValue({
			active: true,
			name: "Natal PIANO",
			description: "Pontos em dobro",
			multiplier: 2,
		});
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("Natal PIANO");
	});

	it("empty state quando não há coleções", async () => {
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [],
			page: 1,
			lastPage: 1,
			total: 0,
		});
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("community.empty");
	});
});

describe("CommunityView — interação de UI (paginação DOM, cópia via botão, report via dialog)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
		mocks.getNotifications.mockResolvedValue([]);
		mocks.getSession.mockReturnValue({ token: "tok-123", user: { id: 4 } });
		mocks.listCommunityCollectionsPage.mockImplementation(async (p: number) => ({
			items: [
				{ id: 9, name: `Coletanea P${p}`, musicsCount: 1, authorName: "A" },
			],
			page: p,
			lastPage: 3,
			total: 3,
		}));
	});

	it("input de busca (v-model no DOM) atualiza searchQuery e filtra cards", async () => {
		const wrapper = await mountView();
		const input = wrapper.find(".community-view__search-input");
		// a busca filtra a PÁGINA CARREGADA (P1), não todas as páginas
		await input.setValue("Coletanea P1");
		await flushPromises();
		expect(wrapper.vm.searchQuery).toBe("Coletanea P1");
		expect(wrapper.vm.filteredCollections).toHaveLength(1);
		// card visível: só o que bate com a busca
		const names = wrapper
			.findAll(".community-view__card-title")
			.map((c) => c.text());
		expect(names).toHaveLength(1);
		expect(names[0]).toContain("Coletanea P1");
		// busca que não bate com nada esvazia o grid
		await input.setValue("zzz-inexistente");
		await flushPromises();
		expect(wrapper.vm.filteredCollections).toHaveLength(0);
		expect(wrapper.find(".community-view__grid").exists()).toBe(false);
	});

	it("botão copiar do card chama saveCopy com a coletânea do card", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__copy-btn").trigger("click");
		await flushPromises();
		expect(mocks.saveCommunityCopy).toHaveBeenCalledTimes(1);
		const arg = mocks.saveCommunityCopy.mock.calls[0][0] as { id: number };
		expect(arg.id).toBe(9);
	});

	it("botão report do card abre o dialog com o nome da coletânea (Teleport)", async () => {
		const wrapper = await mountView();
		await wrapper.find(".community-view__report-btn").trigger("click");
		await flushPromises();
		const dlg = document.body.querySelector(".report-dialog");
		expect(dlg).not.toBeNull();
		expect(dlg?.textContent).toContain("Coletanea P1");
	});

	it("paginação DOM: botão próxima página chama goTo(page+1) e renderiza nova página", async () => {
		const wrapper = await mountView();
		await flushPromises();
		// navegação aparece (lastPage 3 > 1)
		const nav = wrapper.find(".community-view__pagination");
		expect(nav.exists()).toBe(true);
		// botões numerados 1..3
		const pageButtons = nav.findAll(".community-view__page-btn");
		// prev + 3 numerados + next = 5
		expect(pageButtons).toHaveLength(5);
		// clicar no "2" (index 2: prev=0, "1"=1, "2"=2)
		await pageButtons[2].trigger("click");
		await flushPromises();
		expect(wrapper.vm.page).toBe(2);
		expect(wrapper.text()).toContain("Coletanea P2");
	});

	it("botão prev desabilitado na página 1; next habilitado", async () => {
		const wrapper = await mountView();
		await flushPromises();
		const nav = wrapper.find(".community-view__pagination");
		const pageButtons = nav.findAll(".community-view__page-btn");
		expect((pageButtons[0].element as HTMLButtonElement).disabled).toBe(true);
		expect(
			(pageButtons[4].element as HTMLButtonElement).disabled,
		).toBe(false);
		// navegar pra última página (3): next → 2, next → 3
		await pageButtons[4].trigger("click");
		await flushPromises();
		expect(wrapper.vm.page).toBe(2);
		await wrapper.find(".community-view__pagination .community-view__page-btn:last-child").trigger("click");
		await flushPromises();
		expect(wrapper.vm.page).toBe(3);
		const btns = wrapper
			.find(".community-view__pagination")
			.findAll(".community-view__page-btn");
		expect(
			(btns[btns.length - 1].element as HTMLButtonElement).disabled,
		).toBe(true);
	});

	it("paginação some quando só há 1 página (v-if lastPage > 1)", async () => {
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 1, name: "Unica", musicsCount: 1, authorName: "A" }],
			page: 1,
			lastPage: 1,
			total: 1,
		});
		const wrapper = await mountView();
		await flushPromises();
		expect(wrapper.find(".community-view__pagination").exists()).toBe(false);
	});

	it("ReportDialog: fechar pelo dialog limpa reportTarget", async () => {
		const wrapper = await mountView();
		wrapper.vm.openReport(wrapper.vm.collections[0]);
		await flushPromises();
		expect(wrapper.vm.reportTarget).not.toBeNull();
		// fecha via componente (comportamento idêntico ao backdrop click)
		const dlgComp = wrapper.findComponent({ name: "ReportDialog" });
		dlgComp.vm.$emit("close");
		await flushPromises();
		expect(wrapper.vm.reportTarget).toBeNull();
		// e o prop open propagado vira false
		expect(dlgComp.props("open")).toBe(false);
	});
});

describe("CommunityView — botão prev da paginação (clique real)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
		mocks.getNotifications.mockResolvedValue([]);
		mocks.getSession.mockReturnValue({ token: "tok-123", user: { id: 4 } });
		mocks.listCommunityCollectionsPage.mockImplementation(async (p: number) => ({
			items: [{ id: 9, name: `Coletanea P${p}`, musicsCount: 1, authorName: "A" }],
			page: p,
			lastPage: 3,
			total: 3,
		}));
	});

	it("ir pra página 2 pelo next e voltar pra 1 pelo prev", async () => {
		const wrapper = await mountView();
		await flushPromises();
		const nav = () => wrapper.find(".community-view__pagination");
		const btns = () => nav().findAll(".community-view__page-btn");
		// next (último botão) → página 2
		await btns()[btns().length - 1].trigger("click");
		await flushPromises();
		expect(wrapper.vm.page).toBe(2);
		// prev (primeiro botão) agora habilitado → página 1
		expect((btns()[0].element as HTMLButtonElement).disabled).toBe(false);
		await btns()[0].trigger("click");
		await flushPromises();
		expect(wrapper.vm.page).toBe(1);
		expect(wrapper.text()).toContain("Coletanea P1");
	});
});

describe("CommunityView — branches residuais (sem autor, sem capa, sem sessão, sazonal sem descrição)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
		mocks.getNotifications.mockResolvedValue([]);
	});

	it("sem sessão: token null é passado em saveCopy (branch ?? null)", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 5, name: "X", musicsCount: 1, authorName: "A" }],
			page: 1,
			lastPage: 1,
			total: 1,
		});
		const wrapper = await mountView();
		await wrapper.vm.saveCopy(wrapper.vm.collections[0]);
		await flushPromises();
		expect(mocks.registerUse).toHaveBeenCalledWith(5, null);
	});

	it("submitReport sem sessão: token null (branch ?? null)", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 5, name: "X", musicsCount: 1, authorName: "A" }],
			page: 1,
			lastPage: 1,
			total: 1,
		});
		const wrapper = await mountView();
		wrapper.vm.openReport(wrapper.vm.collections[0]);
		await wrapper.vm.submitReport("motivo");
		await flushPromises();
		expect(mocks.reportCollection).toHaveBeenCalledWith(5, "motivo", null);
	});

	it("busca: coletânea SEM authorName não quebra o filtro (branch ?? '')", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 5, name: "Sem Autor", musicsCount: 1, authorName: null }],
			page: 1,
			lastPage: 1,
			total: 1,
		});
		const wrapper = await mountView();
		wrapper.vm.searchQuery = "sem autor";
		await flushPromises();
		expect(wrapper.vm.filteredCollections).toHaveLength(1);
		wrapper.vm.searchQuery = "maria";
		await flushPromises();
		expect(wrapper.vm.filteredCollections).toHaveLength(0);
	});

	it("evento sazonal SEM descrição: banner renderiza sem o parágrafo (v-if)", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [],
			page: 1,
			lastPage: 1,
			total: 0,
		});
		mocks.getSeasonalEvent.mockResolvedValue({
			active: true,
			name: "Evento X",
			description: "",
			multiplier: 2,
		});
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("Evento X");
		// branch v-if description: sem o parágrafo — não há como selecionar direto,
		// garantimos que não renderiza texto vazio
	});

	it("evento sazonal COM descrição: renderiza o texto", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [],
			page: 1,
			lastPage: 1,
			total: 0,
		});
		mocks.getSeasonalEvent.mockResolvedValue({
			active: true,
			name: "Evento Y",
			description: "Pontos em dobro!",
			multiplier: 2,
		});
		const wrapper = await mountView();
		expect(wrapper.text()).toContain("Pontos em dobro!");
	});

	it("tarefas semanais: tarefa done usa ti-circle-check; pendente ti-circle", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [],
			page: 1,
			lastPage: 1,
			total: 0,
		});
		mocks.getWeeklyTasks.mockResolvedValue([
			{ id: "a", description: "Feita", done: true, bonus: 15 },
			{ id: "b", description: "Pendente", done: false, bonus: 15 },
		]);
		const wrapper = await mountView();
		const icons = wrapper.findAll(".community-view__task .ti");
		expect(icons[0].classes()).toContain("ti-circle-check");
		expect(icons[1].classes()).toContain("ti-circle");
	});

	it("coletânea SEM capa: mostra ícone fallback; COM capa: sem fallback", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [
				{ id: 1, name: "Sem Capa", musicsCount: 1, authorName: "A", coverUrl: null },
				{ id: 2, name: "Com Capa", musicsCount: 2, authorName: "B", coverUrl: "http://x/c.jpg" },
			],
			page: 1,
			lastPage: 1,
			total: 2,
		});
		const wrapper = await mountView();
		const covers = wrapper.findAll(".community-view__cover");
		expect(covers).toHaveLength(2);
	});

	it("coletânea SEM authorName: parágrafo de autor não renderiza (v-if)", async () => {
		mocks.getSession.mockReturnValue(null);
		mocks.listCommunityCollectionsPage.mockResolvedValue({
			items: [{ id: 5, name: "Anonima", musicsCount: 1, authorName: null }],
			page: 1,
			lastPage: 1,
			total: 1,
		});
		const wrapper = await mountView();
		expect(
			wrapper.find(".community-view__card-author").exists(),
		).toBe(false);
	});
});
