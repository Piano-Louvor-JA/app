// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaCloseDialog — confirmação de fechamento do player de mídia.
 * v-if="open"; botões Não/Confirmar emitem cancel/confirm.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaCloseDialog from "../MediaCloseDialog.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function mountDialog(open = true) {
	return mount(MediaCloseDialog, {
		props: { open },
		global: { plugins: [i18n] },
	});
}

describe("MediaCloseDialog", () => {
	it("open=false não renderiza nada", () => {
		const w = mountDialog(false);
		expect(w.find(".media-close-dialog").exists()).toBe(false);
	});

	it("open=true renderiza dialog com aria-modal", () => {
		const w = mountDialog();
		expect(w.find(".media-close-dialog").attributes("role")).toBe("dialog");
		expect(w.find(".media-close-dialog").attributes("aria-modal")).toBe("true");
	});

	it("botão Não emite cancel", async () => {
		const w = mountDialog();
		await w.find(".media-close-dialog__btn--no").trigger("click");
		expect(w.emitted("cancel")).toHaveLength(1);
		expect(w.emitted("confirm")).toBeUndefined();
	});

	it("botão Sim emite confirm", async () => {
		const w = mountDialog();
		await w.find(".media-close-dialog__btn--yes").trigger("click");
		expect(w.emitted("confirm")).toHaveLength(1);
		expect(w.emitted("cancel")).toBeUndefined();
	});

	it("clique no backdrop não emite nada", async () => {
		const w = mountDialog();
		await w.find(".media-close-dialog__backdrop").trigger("click");
		expect(w.emitted("confirm")).toBeUndefined();
		expect(w.emitted("cancel")).toBeUndefined();
	});
});
