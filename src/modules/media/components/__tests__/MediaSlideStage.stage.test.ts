// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaSlideStage — palco do operador (/media): superfície de REFERÊNCIA da
 * paridade. Deve refletir StageSettings do scope 'hymns' (override > global)
 * em tempo real (BroadcastChannel/storage), como a projeção e os receivers.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaSlideStage from "../MediaSlideStage.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

const settingsMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../../settings/services/stage-settings-runtime", () => ({
	readEffectiveStageSettings: vi.fn((scope: string) => ({
		__scope: scope,
		...settingsMock.current,
	})),
	subscribeStageSettings: vi.fn(() => () => {}),
}));

function mountStage(over: Record<string, unknown> = {}) {
	return mount(MediaSlideStage, {
		props: {
			lyric: "",
			title: "",
			imageUrl: null,
			...over,
		},
		global: { plugins: [i18n] },
	});
}

describe("MediaSlideStage — paridade StageSettings (scope hymns)", () => {
	beforeEach(() => {
		settingsMock.current = {};
	});

	it("lê settings efetivas do scope hymns", async () => {
		const { readEffectiveStageSettings } = await import(
			"../../../settings/services/stage-settings-runtime"
		);
		settingsMock.current = { textColor: "#ff0000", fontSize: 96 };
		const w = mountStage({ lyric: "abc" });
		expect(readEffectiveStageSettings).toHaveBeenCalledWith("hymns");
		const style = w.find(".media-slide-stage__lyric").attributes("style");
		expect(style).toContain("rgb(255, 0, 0)");
		expect(style).toContain("5cqw");
	});

	it("caixa: aplica textBox/boxOpacity/boxBorder do usuário", () => {
		settingsMock.current = { textBox: true, boxOpacity: 0.4, boxBorder: true };
		const w = mountStage({ lyric: "abc" });
		const style = w.find(".media-slide-stage__lyric").attributes("style");
		expect(style).toContain("rgba(24, 24, 24, 0.4)");
		expect(style).toContain("rgba(255, 255, 255, 0.85)");
	});

	it("alinhamento: respeita textAlign do usuário (não força center)", () => {
		settingsMock.current = { textAlign: "left" };
		const w = mountStage({ lyric: "abc" });
		const style = w.find(".media-slide-stage__lyric").attributes("style");
		expect(style).toContain("left");
	});

	it("sombra: textShadow off → sem sombra custom", () => {
		settingsMock.current = { textShadow: false };
		const w = mountStage({ lyric: "abc" });
		const style = w.find(".media-slide-stage__lyric").attributes("style");
		expect(style).toContain("text-shadow: none");
	});

	it("bg: imagem custom do usuário vence a da música; cor quando sem imagem", () => {
		settingsMock.current = {
			backgroundImage: "data:image/png;base64,AAA",
			backgroundColor: "#123456",
		};
		const w = mountStage({ lyric: "abc", imageUrl: "local://media/x.jpg" });
		const bg = w.find(".media-slide-stage__bg").attributes("style");
		expect(bg).toContain("data:image/png;base64,AAA");
		const root = w.find(".media-slide-stage").attributes("style");
		expect(root).toContain("rgb(18, 52, 86)");
	});

	it("bg: sem custom usa a imagem da música; sem imagem nenhuma → sem __bg", () => {
		const w = mountStage({ lyric: "abc", imageUrl: "local://media/x.jpg" });
		expect(w.find(".media-slide-stage__bg").attributes("style")).toContain("local://media/x.jpg");
		const w2 = mountStage({ lyric: "abc", imageUrl: null });
		expect(w2.find(".media-slide-stage__bg").exists()).toBe(false);
	});
});
