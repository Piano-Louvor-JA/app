// @vitest-environment jsdom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
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

enableAutoUnmount(afterEach);

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

	describe("Esc + Enter", () => {
		const pressEnter = (target: EventTarget = window) => {
			const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event;
		};

		it("Enter com o dialog aberto confirma sem acionar o botão focado do player", () => {
			const w = mountDialog();
			const behind = vi.fn();
			window.addEventListener("keydown", behind);
			const playButton = document.createElement("button");
			document.body.appendChild(playButton);
			const event = pressEnter(playButton);
			expect(w.emitted("confirm")).toHaveLength(1);
			expect(event.defaultPrevented).toBe(true);
			expect(behind).not.toHaveBeenCalled();
			window.removeEventListener("keydown", behind);
			playButton.remove();
			w.unmount();
		});

		it("dialog fechado ou desmontado não reage ao Enter", async () => {
			const w = mountDialog(false);
			pressEnter();
			expect(w.emitted("confirm")).toBeUndefined();
			await w.setProps({ open: true });
			pressEnter();
			expect(w.emitted("confirm")).toHaveLength(1);
			w.unmount();
			expect(pressEnter().defaultPrevented).toBe(false);
		});

		it("player e mini player abertos juntos: um Enter fecha uma vez só", () => {
			const a = mountDialog();
			const b = mountDialog();
			pressEnter();
			expect((a.emitted("confirm") ?? []).length + (b.emitted("confirm") ?? []).length).toBe(1);
			a.unmount();
			b.unmount();
		});
	});
});
