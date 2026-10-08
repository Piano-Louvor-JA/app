// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

/**
 * SettingsToggle — switch acessível: aria-checked, clique emite toggle.
 */
import SettingsToggle from "../SettingsToggle.vue";

describe("SettingsToggle", () => {
	it("modelValue true -> aria-checked true e track --on", () => {
		const wrapper = mount(SettingsToggle, {
			props: { modelValue: true, label: "Modo escuro" },
		});
		expect(wrapper.attributes("aria-checked")).toBe("true");
		expect(wrapper.attributes("aria-label")).toBe("Modo escuro");
		expect(wrapper.find(".settings-toggle__track--on").exists()).toBe(true);
	});

	it("modelValue false -> aria-checked false, sem track --on", () => {
		const wrapper = mount(SettingsToggle, {
			props: { modelValue: false, label: "Modo escuro" },
		});
		expect(wrapper.attributes("aria-checked")).toBe("false");
		expect(wrapper.find(".settings-toggle__track--on").exists()).toBe(false);
	});

	it("clique emite update:modelValue com o valor invertido", async () => {
		const wrapper = mount(SettingsToggle, {
			props: { modelValue: false, label: "X" },
		});
		await wrapper.trigger("click");
		expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([true]);
	});
});
