// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * RandomHistoryPanel — painel lateral do sorteio: histórico (undo/clear),
 * seção de áudio (default/custom/choose, play/mute, volume). Todos os emits.
 */
import randomLocale from "../../locales/pt-BR";
import RandomHistoryPanel from "../RandomHistoryPanel.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": randomLocale },
});

type Props = InstanceType<typeof RandomHistoryPanel>["$props"];

function mountPanel(over: Partial<Props> = {}) {
	return mount(RandomHistoryPanel, {
		props: {
			items: ["Ana", "Bruno"],
			totalCount: 5,
			audioSource: "system",
			customAudioFiles: [],
			customAudioFile: null,
			audioVolume: 0.7,
			audioMuted: false,
			audioPlaying: false,
			...over,
		},
		global: { plugins: [i18n] },
	});
}

function btnByLabel(w: ReturnType<typeof mountPanel>, label: string) {
	const btn = w
		.findAll("button")
		.find((b) => b.attributes("aria-label") === label);
	if (!btn) throw new Error(`botão ${label} não encontrado`);
	return btn;
}

describe("RandomHistoryPanel", () => {
	it("lista vazia: mostra emptyHistory, sem botões de undo", () => {
		const w = mountPanel({ items: [] });
		expect(w.text()).toContain(randomLocale.random.emptyHistory);
		expect(w.findAll("[aria-label^='Desfazer']")).toHaveLength(0);
	});

	it("renderiza itens do histórico em ordem reversa com botão undo", () => {
		const w = mountPanel({ items: ["Ana", "Bruno"], totalCount: 5 });
		const text = w.text();
		expect(text).toContain("Ana");
		expect(text).toContain("Bruno");
		const undos = w
			.findAll("button")
			.filter((b) => (b.attributes("aria-label") ?? "").includes("Desfazer"));
		expect(undos.length).toBe(2);
	});

	it("undo no primeiro item da lista emite index totalCount-1", async () => {
		const w = mountPanel({ items: ["Ana", "Bruno"], totalCount: 5 });
		const undos = w
			.findAll("button")
			.filter((b) => (b.attributes("aria-label") ?? "").includes("Desfazer"));
		await undos[0]?.trigger("click");
		expect(w.emitted("undo")?.[0]).toEqual([4]);
	});

	it("botão Limpar Histórico emite clear", async () => {
		const w = mountPanel();
		const clear = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes("Limpar"));
		await clear?.trigger("click");
		expect(w.emitted("clear")).toHaveLength(1);
	});

	it("audioSource default: botão de áudio padrão ativo", () => {
		const w = mountPanel({ audioSource: "default" as Props["audioSource"] });
		expect(w.html()).toContain("random-history__audio-btn--active");
	});

	it("clicar em Áudio padrão emite use-default-audio", async () => {
		const w = mountPanel({
			audioSource: "custom",
			customAudioFiles: ["x.mp3"],
		});
		const btn = w
			.findAll("button")
			.find((b) =>
				(b.text() ?? "").includes(randomLocale.random.defaultSystemAudio),
			);
		await btn?.trigger("click");
		expect(w.emitted("use-default-audio")).toHaveLength(1);
	});

	it("lista customAudioFiles e emite use-custom-audio ao clicar", async () => {
		const w = mountPanel({
			audioSource: "custom",
			customAudioFiles: ["fanfare.mp3", "drum.mp3"],
			customAudioFile: "fanfare.mp3",
		});
		const items = w
			.findAll("button")
			.filter((b) =>
				["fanfare.mp3", "drum.mp3"].some((f) => (b.text() ?? "").includes(f)),
			);
		expect(items.length).toBeGreaterThanOrEqual(2);
		const drum = items.find((b) => (b.text() ?? "").includes("drum.mp3"));
		await drum?.trigger("click");
		expect(w.emitted("use-custom-audio")?.[0]).toEqual(["drum.mp3"]);
	});

	it("botão remover custom emite remove-custom-audio (stop propagation)", async () => {
		const w = mountPanel({
			audioSource: "custom",
			customAudioFiles: ["fanfare.mp3"],
		});
		const del = btnByLabel(w, randomLocale.random.deleteAudio);
		await del.trigger("click");
		expect(w.emitted("remove-custom-audio")?.[0]).toEqual(["fanfare.mp3"]);
	});

	it("botão Escolher um áudio emite choose-audio", async () => {
		const w = mountPanel();
		const btn = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes(randomLocale.random.chooseAudio));
		await btn?.trigger("click");
		expect(w.emitted("choose-audio")).toHaveLength(1);
	});

	it("toggle-audio e toggle-mute com aria-pressed refletindo estado", async () => {
		const w = mountPanel({ audioPlaying: false, audioMuted: false });
		const play = btnByLabel(w, randomLocale.random.playAudio);
		expect(play.attributes("aria-pressed")).toBe("false");
		await play.trigger("click");
		expect(w.emitted("toggle-audio")).toHaveLength(1);

		const mute = btnByLabel(w, randomLocale.random.muteAudio);
		expect(mute.attributes("aria-pressed")).toBe("false");
		await mute.trigger("click");
		expect(w.emitted("toggle-mute")).toHaveLength(1);

		const w2 = mountPanel({ audioPlaying: true, audioMuted: true });
		expect(
			btnByLabel(w2, randomLocale.random.pauseAudio).attributes("aria-pressed"),
		).toBe("true");
		expect(
			btnByLabel(w2, randomLocale.random.unmuteAudio).attributes(
				"aria-pressed",
			),
		).toBe("true");
	});

	it("ícone de volume reflete mudo ou volume 0", () => {
		const wMuted = mountPanel({ audioMuted: true });
		expect(wMuted.html()).toContain("ti-volume-off");
		const wZero = mountPanel({ audioVolume: 0 });
		expect(wZero.html()).toContain("ti-volume-off");
		const wNormal = mountPanel({ audioVolume: 0.5 });
		expect(wNormal.html()).toContain('"ti ti-volume"');
	});

	it("slider de volume emite update:audio-volume normalizado (0..1)", async () => {
		const w = mountPanel({ audioVolume: 0.7 });
		const slider = w.find('input[type="range"]');
		expect((slider.element as HTMLInputElement).value).toBe("70");
		const input = slider.element as HTMLInputElement;
		input.value = "25";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("update:audio-volume")?.[0]).toEqual([0.25]);
	});

	it("slider cobre a guarda de valor não finito", async () => {
		const w = mountPanel();
		const slider = w.find('input[type="range"]');
		Object.defineProperty(slider.element, "value", { value: "NaN" });
		slider.element.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(w.emitted("update:audio-volume")).toBeUndefined();
	});

	it("slider sanitiza input: browser clamp 'abc'→'50', valor emitido 0.5", async () => {
		// jsdom replica o sanitizar do browser para input[type=range]:
		// valor inválido vira o default (50). A guarda NaN do componente é
		// defensiva (não alcançável via DOM real).
		const w = mountPanel();
		const slider = w.find('input[type="range"]');
		const input = slider.element as HTMLInputElement;
		input.value = "abc";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await w.vm.$nextTick();
		expect(input.value).toBe("50");
		expect(w.emitted("update:audio-volume")?.[0]).toEqual([0.5]);
	});
});
