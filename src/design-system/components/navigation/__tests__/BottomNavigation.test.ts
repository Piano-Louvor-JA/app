// @vitest-environment jsdom

import type { DockNavItem } from "@design-system/types/navigation";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
/**
 * BottomNavigation — wrapper fino do DockFooter: repassa props e reemite select.
 */
import BottomNavigation from "../BottomNavigation.vue";

const items: DockNavItem[] = [
	{ key: "home", label: "Início", icon: "ti-home" },
	{ key: "media", label: "Mídia", icon: "ti-music" },
];

describe("BottomNavigation", () => {
	it("repassa itens ao DockFooter", () => {
		const wrapper = mount(BottomNavigation, { props: { items } });
		expect(wrapper.findAll("button")).toHaveLength(2);
		expect(wrapper.text()).toContain("Início");
	});

	it("reemite select do dock", async () => {
		const wrapper = mount(BottomNavigation, { props: { items } });
		await wrapper.findAll("button")[1]?.trigger("click");
		expect(wrapper.emitted("select")?.[0]).toEqual(["media"]);
	});
});
