// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { createMemoryHistory, createRouter } from "vue-router";

/**
 * SettingsTabs — abas de seção com rota ativa e navegação.
 */
import SettingsTabs from "../SettingsTabs.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt",
	messages: {
		pt: {
			"settings.title": "Configurações",
			"settings.tabs.general": "Geral",
			"settings.tabs.appearance": "Aparência",
			"settings.tabs.media": "Mídia",
			"settings.tabs.projection": "Projeção",
			"settings.tabs.remote": "Remoto",
		},
	},
});

const routes = [
	{ path: "/", name: "settings-general", component: { template: "<div />" } },
	{
		path: "/appearance",
		name: "settings-appearance",
		component: { template: "<div />" },
	},
	{
		path: "/media",
		name: "settings-media",
		component: { template: "<div />" },
	},
	{
		path: "/projection",
		name: "settings-projection",
		component: { template: "<div />" },
	},
	{
		path: "/remote",
		name: "settings-remote",
		component: { template: "<div />" },
	},
];

function makeRouter(currentName: string) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes,
	});
	router.push({ name: currentName });
	return router.isReady().then(() => router);
}

async function mountTabs(currentName: string) {
	const router = await makeRouter(currentName);
	const wrapper = mount(SettingsTabs, {
		global: { plugins: [i18n, router] },
	});
	return { wrapper, router };
}

describe("SettingsTabs", () => {
	it("renderiza as seções visíveis com labels traduzidos", async () => {
		const { wrapper } = await mountTabs("settings-general");
		const items = wrapper.findAll(".settings-tabs__item");
		expect(items.length).toBeGreaterThan(1);
		expect(wrapper.text()).toContain("Geral");
	});

	it("marca a aba da rota atual como ativa (aria-current)", async () => {
		const { wrapper } = await mountTabs("settings-general");
		const active = wrapper.findAll(".settings-tabs__item--active");
		expect(active).toHaveLength(1);
		expect(active[0]?.attributes("aria-current")).toBe("page");
	});

	it("clique em outra aba navega pela router", async () => {
		const { wrapper, router } = await mountTabs("settings-general");
		const items = wrapper.findAll(".settings-tabs__item");
		const target = items.find((i) => i.text().includes("Aparência"));
		await target?.trigger("click");
		await router.isReady();
		await new Promise((r) => setTimeout(r, 0));
		expect(router.currentRoute.value.name).toBe("settings-appearance");
	});

	it("clique na aba já ativa não navega de novo", async () => {
		const { wrapper, router } = await mountTabs("settings-appearance");
		const before = router.currentRoute.value.fullPath;
		const items = wrapper.findAll(".settings-tabs__item");
		const target = items.find((i) => i.text().includes("Aparência"));
		await target?.trigger("click");
		expect(router.currentRoute.value.fullPath).toBe(before);
	});
});
