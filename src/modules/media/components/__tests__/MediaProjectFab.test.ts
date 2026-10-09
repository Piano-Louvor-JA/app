// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaProjectFab — FAB de projetar/retirar projeção de mídia.
 * Branches: projecting → clear, idle → project, disabled bloqueia só
 * quando não está projetando.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaProjectFab from "../MediaProjectFab.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function mountFab(over: { disabled?: boolean; projecting?: boolean } = {}) {
	return mount(MediaProjectFab, {
		props: over,
		global: { plugins: [i18n] },
	});
}

describe("MediaProjectFab", () => {
	it("idle: clique emite project", async () => {
		const w = mountFab();
		await w.find("button").trigger("click");
		expect(w.emitted("project")).toHaveLength(1);
		expect(w.emitted("clear")).toBeUndefined();
	});

	it("projecting: clique emite clear", async () => {
		const w = mountFab({ projecting: true });
		await w.find("button").trigger("click");
		expect(w.emitted("clear")).toHaveLength(1);
		expect(w.emitted("project")).toBeUndefined();
	});

	it("idle + disabled: bloqueia clique", async () => {
		const w = mountFab({ disabled: true });
		expect(w.find("button").attributes("disabled")).toBeDefined();
		await w.find("button").trigger("click");
		expect(w.emitted("project")).toBeUndefined();
	});

	it("disabled explícito como false permite projetar", async () => {
		const w = mountFab({ disabled: false });
		await w.find("button").trigger("click");
		expect(w.emitted("project")).toHaveLength(1);
	});

	it("disabled sem projecting bloqueia no handler", async () => {
		const w = mountFab();
		await (w.vm as unknown as { onClick: (projecting: boolean, disabled: boolean) => void })
			.onClick(false, true);
		expect(w.emitted("project")).toBeUndefined();
		expect(w.emitted("clear")).toBeUndefined();
	});

	it("projecting + disabled: NÃO bloqueia (precisa poder retirar)", async () => {
		const w = mountFab({ disabled: true, projecting: true });
		const btn = w.find("button");
		expect(btn.exists()).toBe(true);
		expect(btn.attributes("disabled")).toBeUndefined();
		await btn.trigger("click");
		expect(w.emitted("clear")).toHaveLength(1);
	});

	it("aria-label muda conforme projecting", () => {
		expect(mountFab().find("button").attributes("aria-label")).toBe(
			mediaLocale.media.project,
		);
		expect(
			mountFab({ projecting: true }).find("button").attributes("aria-label"),
		).toBe(mediaLocale.media.clearProjection);
	});

	it("ícone muda conforme projecting", () => {
		expect(mountFab().html()).toContain("ti-player-play");
		expect(mountFab({ projecting: true }).html()).toContain("ti-player-stop");
	});
});
