// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * RandomAvailablePanel — painel de disponíveis: modo names (input add,
 * import .txt) e modo numbers (min/max + generate + erros de range),
 * lista com remove, clear. Todos os emits e branches de erro.
 */
import randomLocale from "../../locales/pt-BR";
import RandomAvailablePanel from "../RandomAvailablePanel.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": randomLocale },
});

type Props = InstanceType<typeof RandomAvailablePanel>["$props"];

function mountPanel(over: Partial<Props> = {}) {
	return mount(RandomAvailablePanel, {
		props: {
			mode: "names",
			available: ["Ana", "Bruno", "Carla"],
			drawn: [],
			draftName: "",
			numberMin: 1,
			numberMax: 100,
			rangeError: null,
			...over,
		},
		global: { plugins: [i18n] },
	});
}

describe("RandomAvailablePanel — modo names", () => {
	it("renderiza lista de disponíveis", () => {
		const w = mountPanel();
		const text = w.text();
		expect(text).toContain("Ana");
		expect(text).toContain("Bruno");
		expect(text).toContain("Carla");
	});

	it("lista vazia: mostra emptyList", () => {
		const w = mountPanel({ available: [] });
		expect(w.text()).toContain(randomLocale.random.emptyList);
	});

	it("digitar no input emite update:draftName", async () => {
		const w = mountPanel({ draftName: "" });
		const input = w.find(".random-available__input")
			.element as HTMLInputElement;
		input.value = "Diego";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("update:draftName")?.[0]).toEqual(["Diego"]);
	});

	it("Enter no input emite add", async () => {
		const w = mountPanel();
		await w.find(".random-available__input").trigger("keydown.enter");
		expect(w.emitted("add")).toHaveLength(1);
	});

	it("botão + emite add", async () => {
		const w = mountPanel();
		const btn = w
			.findAll("button")
			.find(
				(b) => b.attributes("aria-label") === randomLocale.random.addNameAria,
			);
		await btn?.trigger("click");
		expect(w.emitted("add")).toHaveLength(1);
	});

	it("botão Importar Lista abre o file picker", async () => {
		const w = mountPanel();
		const input = w.find('input[type="file"]');
		const clickSpy = vi
			.spyOn(input.element as HTMLInputElement, "click")
			.mockImplementation(() => {});
		const importBtn = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes(randomLocale.random.importList));
		await importBtn?.trigger("click");
		expect(clickSpy).toHaveBeenCalledOnce();
		clickSpy.mockRestore();
	});

	it("mudança de arquivo emite importFile com o File e reseta o input", async () => {
		const w = mountPanel();
		const input = w.find('input[type="file"]').element as HTMLInputElement;
		const file = new File(["Ana\nBruno"], "lista.txt", { type: "text/plain" });
		Object.defineProperty(input, "files", {
			value: [file],
			configurable: true,
		});
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await w.vm.$nextTick();
		const evts = w.emitted("importFile");
		expect(evts?.length).toBe(1);
		expect((evts?.[0]?.[0] as File).name).toBe("lista.txt");
		expect(input.value).toBe("");
	});

	it("change sem arquivo não emite importFile", async () => {
		const w = mountPanel();
		const input = w.find('input[type="file"]').element as HTMLInputElement;
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("importFile")).toBeUndefined();
	});

	it("botão remover emite remove com o índice", async () => {
		const w = mountPanel();
		const removes = w
			.findAll("button")
			.filter(
				(b) => b.attributes("aria-label") === randomLocale.random.removeItem,
			);
		expect(removes.length).toBe(3);
		await removes[1]?.trigger("click");
		expect(w.emitted("remove")?.[0]).toEqual([1]);
	});

	it("botão Limpar Lista emite clear", async () => {
		const w = mountPanel();
		const btn = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes(randomLocale.random.clearList));
		await btn?.trigger("click");
		expect(w.emitted("clear")).toHaveLength(1);
	});
});

describe("RandomAvailablePanel — modo numbers", () => {
	it("renderiza inputs min/max com valores", () => {
		const w = mountPanel({
			mode: "numbers" as Props["mode"],
			numberMin: 5,
			numberMax: 50,
		});
		const inputs = w.findAll('input[type="number"]');
		expect(inputs).toHaveLength(2);
		expect((inputs[0]?.element as HTMLInputElement).value).toBe("5");
		expect((inputs[1]?.element as HTMLInputElement).value).toBe("50");
	});

	it("modo numbers não mostra form de nomes", () => {
		const w = mountPanel({ mode: "numbers" as Props["mode"] });
		expect(w.find(".random-available__input").exists()).toBe(false);
	});

	it("digitar min emite update:numberMin", async () => {
		const w = mountPanel({ mode: "numbers" as Props["mode"] });
		const input = w.findAll('input[type="number"]')[0]!
			.element as HTMLInputElement;
		input.value = "10";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("update:numberMin")?.[0]).toEqual([10]);
	});

	it("digitar max emite update:numberMax", async () => {
		const w = mountPanel({ mode: "numbers" as Props["mode"] });
		const input = w.findAll('input[type="number"]')[1]!
			.element as HTMLInputElement;
		input.value = "200";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("update:numberMax")?.[0]).toEqual([200]);
	});

	it("Enter no max emite generateRange", async () => {
		const w = mountPanel({ mode: "numbers" as Props["mode"] });
		await w.findAll('input[type="number"]')[1]!.trigger("keydown.enter");
		expect(w.emitted("generateRange")).toHaveLength(1);
	});

	it("botão Gerar Números emite generateRange", async () => {
		const w = mountPanel({ mode: "numbers" as Props["mode"] });
		const btn = w
			.findAll("button")
			.find((b) =>
				(b.text() ?? "").includes(randomLocale.random.generateNumbers),
			);
		await btn?.trigger("click");
		expect(w.emitted("generateRange")).toHaveLength(1);
	});

	it("rangeError invalid: mostra invalidRange", () => {
		const w = mountPanel({
			mode: "numbers" as Props["mode"],
			rangeError: "invalid",
		});
		expect(w.text()).toContain(randomLocale.random.invalidRange);
	});

	it("rangeError tooLarge: mostra rangeTooLarge", () => {
		const w = mountPanel({
			mode: "numbers" as Props["mode"],
			rangeError: "tooLarge",
		});
		expect(w.text()).toContain(randomLocale.random.rangeTooLarge);
	});

	it("sem rangeError: nenhuma mensagem de erro", () => {
		const w = mountPanel({
			mode: "numbers" as Props["mode"],
			rangeError: null,
		});
		expect(w.find(".random-available__error").exists()).toBe(false);
	});
});
