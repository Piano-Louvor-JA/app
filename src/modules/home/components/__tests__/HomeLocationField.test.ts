// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * HomeLocationField — campo de edição inline da home (distrito/igreja).
 * Mesmo padrão dos demais testes de componente: mount + i18n local,
 * interações via trigger e emissões lidas por wrapper.emitted().
 */
import homeLocale from "../../locales/pt-BR";
import HomeLocationField from "../HomeLocationField.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": homeLocale },
});

function mountField(over: Partial<{ value: string; label: string; placeholder: string; size: "lg" | "md" }> = {}) {
	return mount(HomeLocationField, {
		props: {
			value: "Distrito Central",
			label: "Distrito de",
			placeholder: "Digite o nome do seu distrito",
			...over,
		},
		global: { plugins: [i18n] },
		attachTo: document.body,
	});
}

describe("HomeLocationField", () => {
	let active: ReturnType<typeof mountField> | null = null;

	afterEach(() => {
		active?.unmount();
		active = null;
		document.body.innerHTML = "";
	});

	it("value vazio inicia em modo edição (input, sem botão de editar)", () => {
		active = mountField({ value: "" });
		const root = active.find(".home-location-field");
		expect(root.classes()).toContain("home-location-field--editing");
		expect(active.find("input.home-location-field__input").exists()).toBe(true);
		expect(active.find("button.home-location-field__edit").exists()).toBe(false);
	});

	it("value preenchido mostra display com label+valor e botão de editar", () => {
		active = mountField();
		const root = active.find(".home-location-field");
		expect(root.classes()).toContain("home-location-field--filled");
		expect(root.classes()).toContain("home-location-field--lg");
		expect(active.find("input").exists()).toBe(false);
		expect(active.find(".home-location-field__text").text()).toBe("Distrito de Distrito Central");
		const btn = active.find("button.home-location-field__edit");
		expect(btn.attributes("aria-label")).toBe("Editar Distrito de");
		expect(btn.attributes("title")).toBe("Editar Distrito de");
	});

	it("size md aplica a classe de tamanho correspondente", () => {
		active = mountField({ size: "md" });
		expect(active.find(".home-location-field").classes()).toContain("home-location-field--md");
	});

	it("click no lápis entra em edição, foca e seleciona o input", async () => {
		const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		await active.vm.$nextTick();

		const inputEl = document.body.querySelector<HTMLInputElement>("input.home-location-field__input");
		expect(inputEl).not.toBeNull();
		expect(active.find(".home-location-field").classes()).toContain("home-location-field--editing");
		expect(document.activeElement).toBe(inputEl);
		expect(selectSpy).toHaveBeenCalled();
		selectSpy.mockRestore();
	});

	it("blur com rascunho diferente emite save com valor trimado e sai da edição", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		await active.find("input").setValue("  Novo Distrito  ");
		await active.find("input").trigger("blur");

		expect(active.emitted("save")).toEqual([["Novo Distrito"]]);
		expect(active.find(".home-location-field").classes()).not.toContain("home-location-field--editing");
		expect(active.find("button.home-location-field__edit").exists()).toBe(true);
	});

	it("blur com rascunho vazio emite save com '' e mantém edição", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		await active.find("input").setValue("   ");
		await active.find("input").trigger("blur");

		// commit emite sempre que mudou em relação ao value — '' !== 'Distrito Central'
		expect(active.emitted("save")).toEqual([[""]]);
		expect(active.find(".home-location-field").classes()).toContain("home-location-field--editing");
		expect(active.find("input").exists()).toBe(true);
	});

	it("blur com rascunho igual ao valor (com espaços) não emite save", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		await active.find("input").setValue("Distrito Central   ");
		await active.find("input").trigger("blur");

		expect(active.emitted("save")).toBeUndefined();
		expect(active.find(".home-location-field").classes()).not.toContain("home-location-field--editing");
	});

	it("Enter commita o rascunho e desfoca o input", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		const blurSpy = vi.spyOn(
			document.body.querySelector<HTMLInputElement>("input.home-location-field__input")!,
			"blur",
		);

		await active.find("input").setValue("Via Enter");
		await active.find("input").trigger("keydown", { key: "Enter" });

		// Enter chama commit e blur — o blur dispara o @blur=commit de novo (idempotente: editing já false)
		expect(active.emitted("save")).toEqual([["Via Enter"], ["Via Enter"]]);
		expect(blurSpy).toHaveBeenCalled();
	});

	it("Escape cancela: descarta rascunho, volta pro display e não emite", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		const blurSpy = vi.spyOn(
			document.body.querySelector<HTMLInputElement>("input.home-location-field__input")!,
			"blur",
		);

		await active.find("input").setValue("descartado");
		await active.find("input").trigger("keydown", { key: "Escape" });

		expect(active.emitted("save")).toBeUndefined();
		expect(blurSpy).toHaveBeenCalled();
		// sai da edição e o display segue com o valor original
		expect(active.find("input").exists()).toBe(false);
		expect(active.find(".home-location-field__text").text()).toBe("Distrito de Distrito Central");
	});

	it("Escape com value vazio mantém modo edição", async () => {
		active = mountField({ value: "" });
		await active.find("input").setValue("temporário");
		await active.find("input").trigger("keydown", { key: "Escape" });

		expect(active.emitted("save")).toBeUndefined();
		expect(active.find(".home-location-field").classes()).toContain("home-location-field--editing");
	});

	it("valor externo muda fora da edição: draft sincroniza (input mostra valor novo)", async () => {
		active = mountField();
		await active.setProps({ value: "Novo Nome" });
		// continua em display; ao editar, o draft já veio sincronizado
		await active.find("button.home-location-field__edit").trigger("click");
		const input = active.find("input.home-location-field__input");
		expect((input.element as HTMLInputElement).value).toBe("Novo Nome");
	});

	it("valor externo muda durante a edição: draft atual não é sobrescrito", async () => {
		active = mountField();
		await active.find("button.home-location-field__edit").trigger("click");
		await active.find("input").setValue("meu texto");
		await active.setProps({ value: "outro valor" });

		const input = active.find("input.home-location-field__input");
		expect((input.element as HTMLInputElement).value).toBe("meu texto");
		expect(active.find(".home-location-field").classes()).toContain("home-location-field--editing");
	});

	it("valor externo fica vazio: força modo edição com draft vazio", async () => {
		active = mountField();
		await active.setProps({ value: "" });

		expect(active.find(".home-location-field").classes()).toContain("home-location-field--editing");
		const input = active.find("input.home-location-field__input");
		expect((input.element as HTMLInputElement).value).toBe("");
	});
});
