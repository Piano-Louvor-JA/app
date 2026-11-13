// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * audioMimeFromBase64 / audioDataUrlFromBase64 — detecção de formato
 * pelos magic bytes. Formatos suportados: mp3 (default/legacy), wav, ogg.
 */

import {
	audioDataUrlFromBase64,
	audioMimeFromBase64,
} from "../custom-catalog";

const b64 = (bytes: number[]) =>
	btoa(String.fromCharCode(...bytes));

describe("audioMimeFromBase64", () => {
	it("detecta WAV (RIFF header)", () => {
		// "RIFF" + 4 bytes tamanho + "WAVE"
		expect(audioMimeFromBase64(b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBe("audio/wav");
	});

	it("detecta OGG (OggS header)", () => {
		expect(audioMimeFromBase64(b64([0x4f, 0x67, 0x67, 0x53, 0, 1, 2, 3]))).toBe("audio/ogg");
	});

	it("cabeçalho ID3 cai em audio/mpeg (default)", () => {
		expect(audioMimeFromBase64(b64([0x49, 0x44, 0x33, 3, 0, 0, 0, 0]))).toBe("audio/mpeg");
	});

	it("base64 sem cabeçalho reconhecível cai em audio/mpeg (legacy)", () => {
		expect(audioMimeFromBase64(b64([1, 2, 3, 4]))).toBe("audio/mpeg");
	});

	it("base64 inválido não lança — cai em audio/mpeg", () => {
		expect(audioMimeFromBase64("!!!!")).toBe("audio/mpeg");
	});
});

describe("audioDataUrlFromBase64", () => {
	it("monta data URL com mime detectado", () => {
		const wav = b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]);
		expect(audioDataUrlFromBase64(wav)).toBe(`data:audio/wav;base64,${wav}`);
	});
});
