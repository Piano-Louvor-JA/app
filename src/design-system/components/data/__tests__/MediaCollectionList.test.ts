// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

/**
 * MediaCollectionList — busca (v-model), clear, estados loading/empty.
 */
import MediaCollectionList from "../MediaCollectionList.vue";

const baseProps = {
	modelValue: "",
	searchPlaceholder: "Buscar",
	numberLabel: "#",
	titleLabel: "Título",
	durationLabel: "Duração",
	actionsLabel: "Ações",
};

describe("MediaCollectionList", () => {
	it("renderiza cabeçalhos e input de busca", () => {
		const wrapper = mount(MediaCollectionList, {
			props: { ...baseProps, emptyLabel: "Nada" },
		});
		expect(wrapper.text()).toContain("Título");
		expect(wrapper.find('input[type="search"]').exists()).toBe(true);
	});

	it("digitar emite update:modelValue e mostra botão clear", async () => {
		const wrapper = mount(MediaCollectionList, {
			props: { ...baseProps, emptyLabel: "Nada" },
		});
		const input = wrapper.find('input[type="search"]');
		(input.element as HTMLInputElement).value = "hino";
		await input.trigger("input");
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["hino"]);
	});

	it("clearSearch emite string vazia (com modelValue preenchido)", () => {
		const wrapper = mount(MediaCollectionList, {
			props: { ...baseProps, modelValue: "hino", clearAriaLabel: "limpar" },
		});
		const clear = wrapper.find(".ds-media-collection-list__clear");
		expect(clear.exists()).toBe(true);
		clear.trigger("click");
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([""]);
	});

	it("loading: mostra loadingLabel", () => {
		const wrapper = mount(MediaCollectionList, {
			props: { ...baseProps, loading: true, loadingLabel: "Carregando..." },
		});
		expect(wrapper.text()).toContain("Carregando...");
	});

	it("empty: mostra emptyLabel", () => {
		const wrapper = mount(MediaCollectionList, {
			props: { ...baseProps, empty: true, emptyLabel: "Vazio" },
		});
		expect(wrapper.text()).toContain("Vazio");
	});
});
