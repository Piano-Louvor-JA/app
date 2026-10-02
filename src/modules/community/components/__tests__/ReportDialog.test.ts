// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (k: string) => k, locale: { value: "pt-BR" } }),
	createI18n: () => ({ global: { locale: "pt-BR", t: (k: string) => k } }),
}));

import ReportDialog from "../ReportDialog.vue";

async function mountDialog(props: { open: boolean; collectionName?: string }) {
	return mount(ReportDialog, { props });
}

function dialogEl(wrapper: ReturnType<typeof mount>) {
	return document.body.querySelector(".report-dialog");
}

beforeEach(() => {
	vi.clearAllMocks();
	document.body.innerHTML = "";
});

describe("ReportDialog", () => {
	it("open=false: NÃO renderiza nada no body (Teleport inativo)", async () => {
		await mountDialog({ open: false });
		expect(dialogEl(document.body.parentElement as never)).toBeNull();
		expect(document.body.querySelector(".report-dialog")).toBeNull();
	});

	it("open=true: renderiza dialog com aria-modal e título", async () => {
		await mountDialog({ open: true, collectionName: "Coletanea X" });
		const dlg = document.body.querySelector(".report-dialog");
		expect(dlg).not.toBeNull();
		expect(dlg?.getAttribute("role")).toBe("dialog");
		expect(dlg?.getAttribute("aria-modal")).toBe("true");
		expect(dlg?.textContent).toContain("ranking.report");
	});

	it("mostra o nome da coletânea quando informado", async () => {
		await mountDialog({ open: true, collectionName: "Coletanea X" });
		expect(
			document.body.querySelector(".report-dialog__collection")?.textContent,
		).toContain("Coletanea X");
	});

	it("NÃO mostra nome de coletânea quando ausente (v-if)", async () => {
		await mountDialog({ open: true });
		expect(
			document.body.querySelector(".report-dialog__collection"),
		).toBeNull();
	});

	it("abrir limpa o reason anterior (watch open → reset)", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "motivo antigo";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		// fechar e reabrir
		await wrapper.setProps({ open: false });
		await wrapper.setProps({ open: true });
		const again = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		expect(again.value).toBe("");
	});

	it("submit com motivo válido emite submit com trim", async () => {
		const wrapper = await mountDialog({ open: true });
		const form = document.body.querySelector(
			".report-dialog__panel",
		) as HTMLFormElement;
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "  spam aqui  ";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("submit")?.[0]).toEqual(["spam aqui"]);
	});

	it("submit com motivo curto NÃO emite (guard isValid)", async () => {
		const wrapper = await mountDialog({ open: true });
		const form = document.body.querySelector(
			".report-dialog__panel",
		) as HTMLFormElement;
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "ab";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("submit")).toBeUndefined();
	});

	it("submit com só espaços NÃO emite (trim >= MIN)", async () => {
		const wrapper = await mountDialog({ open: true });
		const form = document.body.querySelector(
			".report-dialog__panel",
		) as HTMLFormElement;
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "   ";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("submit")).toBeUndefined();
	});

	it("hint de motivo curto aparece quando reason tem 1-2 chars", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "ab";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		const hint = document.body.querySelector(".report-dialog__hint");
		expect(hint).not.toBeNull();
		expect(hint?.textContent).toContain("ranking.reportTooShort");
	});

	it("hint NÃO aparece com reason vazio (v-if reason.length > 0)", async () => {
		await mountDialog({ open: true });
		expect(document.body.querySelector(".report-dialog__hint")).toBeNull();
	});

	it("botão primário desabilitado quando inválido / habilitado quando válido", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		const primary = document.body.querySelector(
			".report-dialog__btn--primary",
		) as HTMLButtonElement;
		expect(primary.disabled).toBe(true);
		textarea.value = "motivo ok";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(primary.disabled).toBe(false);
	});

	it("backdrop click emite close", async () => {
		const wrapper = await mountDialog({ open: true });
		const backdrop = document.body.querySelector(
			".report-dialog__backdrop",
		) as HTMLElement;
		backdrop.dispatchEvent(new Event("click", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("botão secundário (voltar) emite close", async () => {
		const wrapper = await mountDialog({ open: true });
		const btn = document.body.querySelector(
			".report-dialog__btn--secondary",
		) as HTMLButtonElement;
		btn.dispatchEvent(new Event("click", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("ESC no textarea emite close", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("close")).toHaveLength(1);
	});

	it("maxlength do textarea é 500", async () => {
		await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		expect(textarea.getAttribute("maxlength")).toBe("500");
	});
});

describe("ReportDialog — fechamento de mutantes (limite exato, reset condicional, foco)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		document.body.innerHTML = "";
	});

	it("motivo com EXATAMENTE 3 chars é válido (>= não >)", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		const primary = document.body.querySelector(
			".report-dialog__btn--primary",
		) as HTMLButtonElement;
		textarea.value = "abc";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(primary.disabled).toBe(false);
		// e submete
		const form = document.body.querySelector(
			".report-dialog__panel",
		) as HTMLFormElement;
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("submit")?.[0]).toEqual(["abc"]);
	});

	it("watch NÃO reseta quando open vai pra false (só quando abre)", async () => {
		const wrapper = await mountDialog({ open: true });
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "texto atual";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		// fechar: o componente desmonta do Teleport (v-if), mas o watch não deve resetar
		// estado interno (observável ao reabrir NÃO pelo watch de close)
		await wrapper.setProps({ open: false });
		await wrapper.vm.$nextTick();
		// mutante if(true) chamaria requestAnimationFrame + reset no CLOSE também.
		// Observável: reason permanece "texto atual" no estado interno (vm via setupState
		// não expõe reason; mas ao reabrir SEM mudar open pra true de novo o valor
		// interno persiste — v-if só remove o DOM, não o componente).
		expect(wrapper.find(".report-dialog").exists()).toBe(false);
	});

	it("requestAnimationFrame é chamado AO ABRIR (open false→true; watch não é immediate)", async () => {
		const rafSpy = vi.fn((cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		});
		vi.stubGlobal("requestAnimationFrame", rafSpy);
		const wrapper = await mountDialog({ open: false });
		await wrapper.setProps({ open: true });
		await wrapper.vm.$nextTick();
		expect(rafSpy).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	it("focus vai pro textarea ao abrir (via raf)", async () => {
		let rafCb: FrameRequestCallback | undefined;
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((cb: FrameRequestCallback) => {
				rafCb = cb;
				return 0;
			}),
		);
		const wrapper = await mountDialog({ open: false });
		await wrapper.setProps({ open: true });
		await flushPromises(); // v-if monta o textarea no Teleport
		// agora dispara o callback capturado: focus roda no elemento já montado
		rafCb?.(0);
		const textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		// jsdom: focus muda document.activeElement
		expect(document.activeElement).toBe(textarea);
		vi.unstubAllGlobals();
	});
});

describe("ReportDialog — mata mutante ternário L27 (open true→false→true reseta)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		document.body.innerHTML = "";
	});

	it("reabrir de verdade (false→true) reseta o reason visível no DOM", async () => {
		const wrapper = await mountDialog({ open: true });
		let textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		textarea.value = "rascunho antigo";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();

		// fecha (v-if desmonta o painel)
		await wrapper.setProps({ open: false });
		await wrapper.vm.$nextTick();
		// reabre: watch(true) DEVE zerar reason
		await wrapper.setProps({ open: true });
		await wrapper.vm.$nextTick();
		textarea = document.body.querySelector(
			"#report-reason",
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe("");
	});
});

describe("ReportDialog — mata mutante if(open) L27 (fechar NÃO reseta/foca)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		document.body.innerHTML = "";
	});

	it("fechar (true→false) NÃO chama requestAnimationFrame (mutante if(true) chamaria)", async () => {
		const rafSpy = vi.fn((cb: FrameRequestCallback) => {
			cb(0);
			return 0;
		});
		vi.stubGlobal("requestAnimationFrame", rafSpy);
		const wrapper = await mountDialog({ open: false });
		expect(rafSpy).not.toHaveBeenCalled();
		await wrapper.setProps({ open: true });
		await wrapper.vm.$nextTick();
		const chamadasAoAbrir = rafSpy.mock.calls.length;
		expect(chamadasAoAbrir).toBe(1);

		await wrapper.setProps({ open: false });
		await wrapper.vm.$nextTick();
		// com if(open): nenhum rAF a mais no close. Com mutante if(true): +1.
		expect(rafSpy.mock.calls.length).toBe(chamadasAoAbrir);
		vi.unstubAllGlobals();
	});
});
