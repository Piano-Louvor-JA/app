// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

/**
 * MediaStatusPreview — cartão de pré-visualização (snippet + referência).
 * Componente puro de exibição.
 */
import MediaStatusPreview from "../MediaStatusPreview.vue";

describe("MediaStatusPreview", () => {
	it("renderiza snippet entre aspas e referência", () => {
		const w = mount(MediaStatusPreview, {
			props: { snippet: "Porque Deus amou o mundo", reference: "João 3:16" },
		});
		expect(w.find(".media-status-preview__text").text()).toContain(
			"Porque Deus amou o mundo",
		);
		expect(w.find(".media-status-preview__ref").text()).toContain("João 3:16");
	});

	it("tem aria-live polite", () => {
		const w = mount(MediaStatusPreview, {
			props: { snippet: "x", reference: "y" },
		});
		expect(w.find(".media-status-preview").attributes("aria-live")).toBe(
			"polite",
		);
	});

	it("snippet vazio renderiza aspas vazias sem quebrar", () => {
		const w = mount(MediaStatusPreview, {
			props: { snippet: "", reference: "" },
		});
		expect(w.find(".media-status-preview__text").text()).toContain("“”");
	});
});
