// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

/**
 * GlassCard — props padding/elevated alternam classes; usa BlurSystem.
 */

vi.mock("@design-system/composables", () => ({
	useBlurSystem: vi.fn(() => ({})),
}));

import GlassCard from "../GlassCard.vue";

describe("GlassCard", () => {
	it("defaults: padded true, elevated false", () => {
		const wrapper = mount(GlassCard, { slots: { default: "<p>x</p>" } });
		expect(wrapper.classes()).toContain("ds-glass-card");
		expect(wrapper.classes()).toContain("ds-glass-card--padded");
		expect(wrapper.classes()).not.toContain("ds-glass-card--elevated");
		expect(wrapper.text()).toContain("x");
	});

	it("padding false remove a classe; elevated true adiciona", () => {
		const wrapper = mount(GlassCard, {
			props: { padding: false, elevated: true },
		});
		expect(wrapper.classes()).not.toContain("ds-glass-card--padded");
		expect(wrapper.classes()).toContain("ds-glass-card--elevated");
	});
});
