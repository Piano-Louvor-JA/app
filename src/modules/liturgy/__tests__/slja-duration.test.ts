// @vitest-environment jsdom
// app#331: duração do item de música importado — estimada do .slja (último
// tempo_hms + margem), guardada na música LOCAL e exposta pelo catálogo da
// liturgia (enrichJaDurations aplica em itens .ja; o dialog aplica no draft
// na importação direta).

import { getLocalMusic } from "@modules/media/services/local-custom-store";
import { beforeEach, describe, expect, it } from "vitest";
import {
	estimateSljaDurationMs,
	importSljaAsLiturgyMusic,
} from "../services/import-slja-to-liturgy";

describe("duração do item de música .slja importado (app#331)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("estimativa: último tempo_hms + margem de 30s", () => {
		expect(
			estimateSljaDurationMs([
				{ timeMs: 0 },
				{ timeMs: 20_000 },
				{ timeMs: 61_500 },
			]),
		).toBe(91_500);
	});

	it(".slja sem timing → 0 (operador digita a duração)", () => {
		expect(estimateSljaDurationMs([{ timeMs: 0 }])).toBe(0);
		expect(estimateSljaDurationMs([])).toBe(0);
	});

	it("import guarda durationMs estimada na música LOCAL", async () => {
		const archive = {
			title: "Missao Para Todos",
			audio: { name: "a.mp3", bytes: new Uint8Array([1, 2, 3]) },
			assets: [],
			slides: [
				{ lyric: "Verso", type: "LETRA" as const, timeMs: 61_000, order: 1 },
			],
		};
		const { buildSlja } = await import("@shared/services/slja");
		const imported = await importSljaAsLiturgyMusic({
			bytes: await buildSlja(archive),
			name: "missao.slja",
		});

		expect(imported.durationMs).toBe(91_000);
		// Persistido na LocalMusic (sobrevive a reload junto com o resto)
		expect(getLocalMusic(imported.musicId)?.durationMs).toBe(91_000);
	});
});
