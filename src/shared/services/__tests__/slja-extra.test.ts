// @vitest-environment jsdom

import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { SljaArchive, SljaSlide } from "../slja";
/**
 * Complemento slja — buildSlja round-trip (INI gerado + ZIP + re-parse),
 * formatos legado (tempo em bytes, hms 2 campos), backslash Delphi e
 * wrapper .slja.zip.
 */
import { buildSlja, parseSlja, parseSljaFile } from "../slja";

function makeSlide(over: Partial<SljaSlide> = {}): SljaSlide {
	return {
		lyric: "linha1\nlinha2",
		type: "LETRA",
		timeMs: 0,
		...over,
	};
}

describe("buildSlja + parseSlja — round-trip", () => {
	it("arquivo completo com áudio e imagens volta idêntico", async () => {
		const archive: SljaArchive = {
			title: "Hino Teste",
			version: "2.1",
			audio: { name: "play.mp3", bytes: new Uint8Array([1, 2, 3]) },
			assets: [
				{ path: "fundo.jpg", bytes: new Uint8Array([9, 8]) },
				{ path: "fundo.jpg", bytes: new Uint8Array([9, 8]) }, // dedup
			],
			slides: [
				makeSlide({
					type: "CAPA",
					lyric: "capa",
					timeMs: 3_723_000,
					textColor: "#fff",
					boxColor: "#000",
					textBox: true,
					fontSize: 40,
					image: { name: "fundo.jpg", bytes: new Uint8Array(0) },
					imagePosition: 2,
				}),
				makeSlide({
					auxiliaryLyric: "aux",
					auxiliaryTextColor: "#eee",
					backgroundColor: "#111",
					auxiliaryFontSize: 24,
				}),
			],
		};
		const buffer = await buildSlja(archive);
		const parsed = await parseSlja(buffer);
		expect(parsed.title).toBe("Hino Teste");
		expect(parsed.version).toBe("2.1");
		expect(parsed.audio?.name).toBe("play.mp3");
		expect(parsed.slides).toHaveLength(2);
		expect(parsed.slides[0]?.type).toBe("CAPA");
		expect(parsed.slides[0]?.lyric).toBe("capa");
		// hms 01:02:03 → 3_723_000ms
		expect(parsed.slides[0]?.timeMs).toBe(3_723_000);
		expect(parsed.slides[0]?.textColor).toBe("#fff");
		expect(parsed.slides[0]?.boxColor).toBe("#000");
		expect(parsed.slides[0]?.textBox).toBe(true);
		expect(parsed.slides[0]?.fontSize).toBe(40);
		expect(parsed.slides[0]?.image?.name).toBe("fundo.jpg");
		expect(parsed.slides[0]?.imagePosition).toBe(2);
		expect(parsed.slides[1]?.auxiliaryLyric).toBe("aux");
		expect(parsed.slides[1]?.backgroundColor).toBe("#111");
		expect(parsed.assets?.some((a) => a.path === "fundo.jpg")).toBe(true);
	});

	it("sem áudio → audio=0 no INI e undefined no parse", async () => {
		const buffer = await buildSlja({
			title: "Sem áudio",
			slides: [makeSlide()],
		});
		const parsed = await parseSlja(buffer);
		expect(parsed.audio).toBeUndefined();
		expect(parsed.slides[0]?.timeMs).toBe(0);
	});

	it("sem título e sem versão → defaults no INI", async () => {
		const archive = {
			title: "",
			slides: [] as SljaSlide[],
		} as SljaArchive;
		const buffer = await buildSlja(archive);
		const parsed = await parseSlja(buffer);
		expect(parsed.title).toBeTruthy(); // 'Sem título' ou vazio do INI
	});
});

describe("parseSlja — INIs legados do Delphi", () => {
	function zipWithIni(
		ini: string,
		extra: Record<string, Uint8Array> = {},
	): ArrayBuffer {
		const files: Record<string, Uint8Array> = {
			"slides.lja": strToU8(ini),
			...extra,
		};
		return zipSync(files).buffer as ArrayBuffer;
	}

	it("tempo em BYTES (legado) → ms aproximado; backslash nos caminhos", async () => {
		const ini = [
			"[Geral]",
			"slides=1",
			"audio=1",
			"url_musica=audio\\musica.mp3",
			"",
			"[Slide:1]",
			"tipo=LETRA",
			"letra=ola|mundo",
			"tempo=176400",
		].join("\r\n");
		const buffer = zipWithIni(ini, {
			"audio\\musica.mp3": new Uint8Array([1]),
		});
		const parsed = await parseSlja(buffer);
		expect(parsed.audio?.name).toBe("musica.mp3");
		// 176400 bytes = 1 segundo ≈ 1000ms
		expect(parsed.slides[0]?.timeMs).toBe(1000);
		expect(parsed.slides[0]?.lyric).toBe("ola\nmundo");
	});

	it("tempo_hms com 2 campos (MM:SS)", async () => {
		const ini = [
			"[Geral]",
			"slides=1",
			"",
			"[Slide:1]",
			"tempo_hms=02:30",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.timeMs).toBe(150_000);
	});

	it("tempo_hms inválido (1 campo) → 0", async () => {
		const ini = ["[Geral]", "slides=1", "", "[Slide:1]", "tempo_hms=42"].join(
			"\r\n",
		);
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.timeMs).toBe(0);
	});

	it("tempo não numérico → 0", async () => {
		const ini = ["[Geral]", "slides=1", "", "[Slide:1]", "tempo=abc"].join(
			"\r\n",
		);
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.timeMs).toBe(0);
	});

	it("slides ausentes no INI são pulados; contagem maior que seções", async () => {
		const ini = [
			"[Geral]",
			"slides=3",
			"",
			"[Slide:1]",
			"tipo=CAPA",
			"",
			"[Slide:3]",
			"tipo=LETRA",
			"letra=x",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides).toHaveLength(2);
		expect(parsed.slides[0]?.type).toBe("CAPA");
		expect(parsed.slides[1]?.type).toBe("LETRA");
	});

	it("seção sem tipo: slide 1 → CAPA, demais → LETRA", async () => {
		const ini = [
			"[Geral]",
			"slides=2",
			"",
			"[Slide:1]",
			"",
			"[Slide:2]",
			"",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.type).toBe("CAPA");
		expect(parsed.slides[1]?.type).toBe("LETRA");
	});

	it("título de versão quando sem titulo (versao → vN)", async () => {
		const ini = ["[Geral]", "slides=0", "versao=3.5"].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.title).toBe("v3.5");
	});

	it("sem slides.lja no zip → erro claro", async () => {
		const buffer = zipSync({ "outro.txt": strToU8("x") }).buffer as ArrayBuffer;
		await expect(parseSlja(buffer)).rejects.toThrow(
			"slides.lja não encontrado",
		);
	});

	it("cor_fundo com fundo_letra=0 → backgroundColor", async () => {
		const ini = [
			"[Geral]",
			"slides=1",
			"",
			"[Slide:1]",
			"cor_fundo=#123",
			"fundo_letra=0",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.backgroundColor).toBe("#123");
		expect(parsed.slides[0]?.boxColor).toBeUndefined();
	});

	it("letra_aux e cor_letra_aux mapeados", async () => {
		const ini = [
			"[Geral]",
			"slides=1",
			"",
			"[Slide:1]",
			"letra_aux=a|b",
			"cor_letra_aux=#fff",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.auxiliaryLyric).toBe("a\nb");
		expect(parsed.slides[0]?.auxiliaryTextColor).toBe("#fff");
	});

	it("imagem_posicao e imagem com backslash", async () => {
		const ini = [
			"[Geral]",
			"slides=1",
			"",
			"[Slide:1]",
			"imagem=imagens\\f.jpg",
			"imagem_posicao=4",
		].join("\r\n");
		const parsed = await parseSlja(zipWithIni(ini));
		expect(parsed.slides[0]?.image?.name).toBe("f.jpg");
		expect(parsed.slides[0]?.imagePosition).toBe(4);
	});
});

describe("buildSlja — rawIni preservado", () => {
	it("com rawIni o build usa o INI cru sem regenerar", async () => {
		const archive = {
			title: "Qualquer",
			rawIni: "[Geral]\nslides=0\ntitulo=Do RAW",
			slides: [],
		} as unknown as SljaArchive;
		const buffer = await buildSlja(archive);
		const parsed = await parseSlja(buffer);
		expect(parsed.title).toBe("Do RAW");
	});
});

describe("parseSljaFile — wrapper .zip do WhatsApp", () => {
	it("zip externo com .slja dentro → parseia e devolve innerName", async () => {
		const inner = zipSync({
			"slides.lja": strToU8(
				["[Geral]", "slides=0", "titulo=Interno"].join("\r\n"),
			),
		});
		const wrapper = zipSync({ "musica sobrenome.slja": new Uint8Array(inner) });
		const result = await parseSljaFile(
			wrapper.buffer as ArrayBuffer,
			"x.slja.zip",
		);
		expect(result.title).toBe("Interno");
		expect(result.innerName).toBe("musica sobrenome.slja");
	});

	it("zip sem .slja interno → erro claro", async () => {
		const wrapper = zipSync({ "leia-me.txt": strToU8("nada") });
		await expect(
			parseSljaFile(wrapper.buffer as ArrayBuffer, "x.zip"),
		).rejects.toThrow(".slja não encontrado");
	});
});

describe("slja — ramos residuais", () => {
	it("ini sem seção Geral → defaults; textBox false gera fundo_letra=0", async () => {
		// textBox false → linha fundo_letra=0 presente (ramo ternário)
		const archive: SljaArchive = {
			title: "T",
			slides: [makeSlide({ textBox: false })],
		};
		const buffer = await buildSlja(archive);
		const parsed = await parseSlja(buffer);
		expect(parsed.slides[0]?.textBox).toBe(false);
	});

	it("zip corrompido rejeita o unzip (ramo err do callback)", async () => {
		const fakeZip = new ArrayBuffer(8);
		new Uint8Array(fakeZip).set([1, 2, 3, 4, 5, 6, 7, 8]);
		await expect(parseSlja(fakeZip)).rejects.toThrow();
	});

	it("parseSljaFile com fileName .zip e unzip corrompido → rejeita", async () => {
		const fakeZip = new ArrayBuffer(8);
		new Uint8Array(fakeZip).set([9, 9, 9, 9, 9, 9, 9, 9]);
		await expect(parseSljaFile(fakeZip, "a.slja.zip")).rejects.toThrow();
	});

