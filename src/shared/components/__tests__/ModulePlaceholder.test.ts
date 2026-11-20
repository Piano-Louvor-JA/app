// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * ModulePlaceholder — título via i18n (titleKey) + "coming soon".
 */
import ModulePlaceholder from "../ModulePlaceholder.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt",
	fallbackLocale: "pt",
	messages: {
		pt: {
			"mod.bible": "Bíblia",
			"common.comingSoon": "Em breve",
		},
	},
});

describe("ModulePlaceholder", () => {
	it("traduz titleKey e mostra coming soon", () => {
		const wrapper = mount(ModulePlaceholder, {
			props: { titleKey: "mod.bible" },
			global: { plugins: [i18n] },
		});
		expect(wrapper.text()).toContain("Bíblia");
		expect(wrapper.text()).toContain("Em breve");
	});
});
