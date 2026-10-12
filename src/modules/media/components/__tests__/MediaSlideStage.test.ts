// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaSlideStage — palco de slide (capa de música): bg opcional com imagem,
 * conteúdo com clipping de capa, fallback pro título quando sem letra.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaSlideStage from "../MediaSlideStage.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

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

describe("MediaSlideStage", () => {
	it("mostra a letra limpa de quebras HTML", () => {
		const w = mountStage({
			lyric: "Primeira linha<br>Segunda",
			title: "Título",
		});
		expect(w.find(".media-slide-stage__lyric").text()).not.toContain("<br>");
		expect(w.text()).toContain("Segunda");
	});

	it("sem letra: mostra o título no lugar", () => {
		const w = mountStage({ lyric: "", title: "Santíssimo" });
		expect(w.text()).toContain("Santíssimo");
	});

	it("capa sem título: cai no fallback t('media.title')", () => {
		const w = mountStage({ lyric: "", title: "", isCover: true });
		expect(w.text()).toContain("Player");
	});

	it("sem letra e sem título (não-capa): não mostra fallback", () => {
		const w = mountStage({ lyric: "", title: "" });
		expect(w.find(".media-slide-stage__lyric").text()).toBe("");
	});

	it("capa: ignora a letra e mostra o título com estilo de capa", () => {
		const w = mountStage({
			lyric: "letra qualquer",
			title: "Nome da Música",
			isCover: true,
		});
		expect(w.text()).toContain("Nome da Música");
		expect(w.text()).not.toContain("letra qualquer");
		expect(w.find(".media-slide-stage__lyric--cover").exists()).toBe(true);
		expect(w.find(".media-slide-stage__content--cover").exists()).toBe(true);
	});

	it("com imagem: aplica background url", () => {
		const w = mountStage({ imageUrl: "https://example.com/capa.jpg" });
		const bg = w.find(".media-slide-stage__bg");
		expect(bg.exists()).toBe(true);
		expect(bg.attributes("style")).toContain("https://example.com/capa.jpg");
	});

	it("sem imagem: sem background", () => {
		const w = mountStage();
		expect(w.find(".media-slide-stage__bg").exists()).toBe(false);
	});
});
