// @vitest-environment jsdom

import type { DockNavItem } from "@design-system/types/navigation";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
/**
 * DockFooter — renderiza itens do dock, marca o ativo e emite select.
 */
import DockFooter from "../DockFooter.vue";

const items: DockNavItem[] = [
	{ key: "home", label: "Início", icon: "ti-home" },
	{ key: "media", label: "Mídia", icon: "ti-music" },
	{ key: "settings", label: "Config", icon: "ti-settings" },
];

describe("DockFooter", () => {
	it("renderiza todos os itens com label e ícone", () => {
		const wrapper = mount(DockFooter, { props: { items } });
		const buttons = wrapper.findAll("button");
		expect(buttons).toHaveLength(3);
		expect(wrapper.text()).toContain("Início");
		expect(wrapper.text()).toContain("Mídia");
		expect(wrapper.text()).toContain("Config");
		expect(wrapper.html()).toContain("ti-home");
	});

	it("activeKey marca o item ativo com dot", () => {
		const wrapper = mount(DockFooter, { props: { items, activeKey: "media" } });
		const active = wrapper.findAll(".ds-dock__item--active");
		expect(active).toHaveLength(1);
		expect(active[0]?.text()).toContain("Mídia");
		expect(wrapper.find(".ds-dock__dot").exists()).toBe(true);
	});

	it("sem activeKey -> nenhum ativo, sem dot", () => {
		const wrapper = mount(DockFooter, { props: { items } });
		expect(wrapper.findAll(".ds-dock__item--active")).toHaveLength(0);
		expect(wrapper.find(".ds-dock__dot").exists()).toBe(false);
	});

	it("clique emite select com a key", async () => {
		const wrapper = mount(DockFooter, { props: { items } });
		await wrapper.findAll("button")[2]?.trigger("click");
		expect(wrapper.emitted("select")?.[0]).toEqual(["settings"]);
	});
});
