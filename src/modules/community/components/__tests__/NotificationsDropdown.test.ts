// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// vi.mock é HOISTED: mocks em vi.hoisted.
const mocks = vi.hoisted(() => ({
	markAllRead: vi.fn(async () => undefined),
}));

vi.mock("../../services/notifications", () => ({
	markAllRead: mocks.markAllRead,
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k }),
}));

import NotificationsDropdown from "../NotificationsDropdown.vue";

const N = (id: number, type = "music_promoted") => ({
	id,
	type,
	title: `T${id}`,
	body: `B${id}`,
	created_at: "2026-09-16T12:00:00Z",
});

// jsdom não tem scrollTo (o componente não usa, mas por segurança não é preciso aqui)
const live: ReturnType<typeof mount>[] = [];

function mountDropdown(notifs: ReturnType<typeof N>[]) {
	const wrapper = mount(NotificationsDropdown, {
		props: { notifications: notifs },
		attachTo: document.body,
	});
	live.push(wrapper);
	return wrapper;
}

// Teleport renderiza em document.body FORA do wrapper do VTU
function q(sel: string): Element | null {
	return document.body.querySelector(sel);
}
function qa(sel: string): Element[] {
	return [...document.body.querySelectorAll(sel)];
}

describe("NotificationsDropdown — componente isolado", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const w of live.splice(0)) w.unmount();
		document.body.innerHTML = "";
	});

	it("lista cada notificação com ícone/título/body corretos", () => {
		const wrapper = mountDropdown([N(1), N(2, "badge_granted")]);
		const items = qa(".notif-dropdown__item");
		expect(items).toHaveLength(2);
		// ícones por tipo (mata mutantes de iconByType)
		expect(items[0].querySelector("i")?.className).toContain("ti-trophy");
		expect(items[1].querySelector("i")?.className).toContain("ti-award");
		// título e body renderizados
		expect(document.body.textContent).toContain("T1");
		expect(document.body.textContent).toContain("B2");
	});

	it("ícone por tipo: todos os 5 tipos mapeados (mata iconByType)", () => {
		const tipos: Array<[string, string]> = [
			["music_promoted", "ti-trophy"],
			["curation_approved", "ti-circle-check"],
			["curation_rejected", "ti-circle-x"],
			["collection_published", "ti-broadcast"],
			["badge_granted", "ti-award"],
		];
		const notifs = tipos.map(([t], i) => N(i + 1, t));
		mountDropdown(notifs);
		const items = qa(".notif-dropdown__item");
		tipos.forEach(([, icone], i) => {
			expect(items[i].querySelector("i")?.className).toContain(icone);
		});
	});

	it("ícone default ti-bell para tipo desconhecido (fallback ??)", () => {
		mountDropdown([N(9, "tipo_inexistente")]);
		expect(q(".notif-dropdown__item i")?.className).toContain("ti-bell");
	});

	it("sem notificações: mostra empty e SEM botão marcar", () => {
		mountDropdown([]);
		expect(q(".notif-dropdown__empty")).not.toBeNull();
		expect(document.body.textContent).toContain("notifications.empty");
		expect(q(".notif-dropdown__mark")).toBeNull();
	});

	it("botão marcar: chama service 1x, emite mark-read e close (markAndClose)", async () => {
		const wrapper = mountDropdown([N(1)]);
		q(".notif-dropdown__mark")!.dispatchEvent(
			new MouseEvent("click", { bubbles: true }),
		);
		await wrapper.vm.$nextTick();
		expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
		expect(wrapper.emitted("mark-read")).toHaveLength(1);
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("com lista vazia o botão não existe → markAndClose nem roda", () => {
		// mata mutantes if(length>0)→if(true) / >=0
		mountDropdown([]);
		expect(q(".notif-dropdown__mark")).toBeNull();
		expect(mocks.markAllRead).not.toHaveBeenCalled();
	});

	it("armed-gate: clique FORA imediato (mesmo tick da abertura) NÃO fecha", async () => {
		const wrapper = mountDropdown([N(1)]);
		// clique no document no MESMO tick: armed ainda é false → ignora
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toBeUndefined();
	});

	it("armed-gate: após um tick, clique FORA fecha e clique DENTRO não fecha", async () => {
		const wrapper = mountDropdown([N(1)]);
		await new Promise((r) => setTimeout(r, 10));
		// clique dentro (no head) não emite close
		q(".notif-dropdown__head")!.dispatchEvent(
			new MouseEvent("click", { bubbles: true }),
		);
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toBeUndefined();
		// clique fora (no body) emite close
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("desmonta sem erro (remove listener de document)", async () => {
		const wrapper = mountDropdown([N(1)]);
		wrapper.unmount();
		live.length = 0;
		// clique fora após unmount não deve lançar
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flushPromises();
		expect(true).toBe(true);
	});
});

describe("NotificationsDropdown — defesa em profundidade", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const w of live.splice(0)) w.unmount();
		document.body.innerHTML = "";
	});

	it("markAndClose com lista vazia: NEM service NEM mark-read (guard do script independe do v-if)", async () => {
		// mata if(length>0)→if(true) e →>=0: mesmo que alguém remova o v-if do
		// template, o guard do script impede marcar lidas sem notificações
		const wrapper = mountDropdown([]);
		const vm = wrapper.vm as unknown as { markAndClose: () => void };
		vm.markAndClose();
		await wrapper.vm.$nextTick();
		expect(mocks.markAllRead).not.toHaveBeenCalled();
		expect(wrapper.emitted("mark-read")).toBeUndefined();
		// close é emitido incondicionalmente (o dropdown sempre fecha)
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("listener em capture phase: roda antes de stopImmediatePropagation em bubble no document", async () => {
		// mata addEventListener capture true→false. Um handler de bubble no
		// document registrado ANTES com stopImmediatePropagation mataria um
		// listener de bubble posterior — mas NUNCA um de capture (fases distintas).
		const blocker = (e: MouseEvent) => e.stopImmediatePropagation();
		document.addEventListener("click", blocker, false);
		const wrapper = mountDropdown([N(1)]);
		await new Promise((r) => setTimeout(r, 10)); // armed

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await wrapper.vm.$nextTick();

		// capture=true → onDocClick roda na fase de capture, imune ao blocker de
		// bubble → close emitido. Com o mutante (capture=false) o onDocClick seria
		// morto pelo stopImmediatePropagation → close NUNCA emitido.
		expect(wrapper.emitted("close")).toHaveLength(1);
		document.removeEventListener("click", blocker, false);
		wrapper.unmount();
	});
});
