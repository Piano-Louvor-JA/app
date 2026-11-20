// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

/**
 * GradientBackground — data-intensity reflete a prop; camadas e slot.
 */
import GradientBackground from "../GradientBackground.vue";

describe("GradientBackground", () => {
	it("default subtle; camadas glow/dither/content presentes", () => {
		const wrapper = mount(GradientBackground, {
			slots: { default: "<p>app</p>" },
		});
		expect(wrapper.attributes("data-intensity")).toBe("subtle");
		expect(wrapper.find(".ds-gradient-bg__glow").exists()).toBe(true);
		expect(wrapper.find(".ds-gradient-bg__dither").exists()).toBe(true);
		expect(wrapper.text()).toContain("app");
	});

	it.each(["medium", "strong"])("intensity %s aplicado", (intensity) => {
		const wrapper = mount(GradientBackground, {
			props: { intensity: intensity as "medium" | "strong" },
		});
		expect(wrapper.attributes("data-intensity")).toBe(intensity);
	});
});
