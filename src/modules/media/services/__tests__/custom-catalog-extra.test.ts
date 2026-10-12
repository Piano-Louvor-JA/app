// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento custom-catalog — ramos residuais: formatDurationLabel/formato
 * já-formatado, probeAudioDuration (metadata/erro/null/timeout), uploadCustomFile
 * e enrichDurations com concorrência.
 */

const mocks = vi.hoisted(() => ({
	authHeadersMock: vi.fn(() => ({ Authorization: "Bearer x" })),
	getAuthSessionMock: vi.fn(() => null),
	loadMediaTrackMock: vi.fn(async () => null),
	resolveRemoteFileUrlMock: vi.fn(
		(p: string) => `https://files.example.com${p}`,
	),
}));

vi.mock("../auth-client", () => ({
	authHeaders: () => mocks.authHeadersMock(),
	getAuthSession: () => mocks.getAuthSessionMock(),
}));
vi.mock("../media-catalog", () => ({
	loadMediaTrack: (...args: unknown[]) =>
		mocks.loadMediaTrackMock(...(args as [number])),
}));
vi.mock("../media-audio", () => ({
	resolveRemoteFileUrl: (p: string) => mocks.resolveRemoteFileUrlMock(p),
}));

import {
	enrichDurations,
	formatDurationLabel,
	probeAudioDuration,
	uploadCustomFile,
} from "../custom-catalog";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ id_file: 7, url: "/file/a.mp3" }),
		})),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("formatDurationLabel — ramos", () => {
	it("já formatado HH:MM:SS com horas vazias -> MM:SS", () => {
		expect(formatDurationLabel("00:03:45")).toBe("03:45");
	});

	it("já formatado MM:SS -> intacto", () => {
		expect(formatDurationLabel("3:45")).toBe("3:45");
	});

	it("string numérica -> formata", () => {
		expect(formatDurationLabel("65")).toBe("1:05");
	});

	it("string não numérica -> 0:00", () => {
		expect(formatDurationLabel("abc")).toBe("0:00");
	});

	it("null/vazio -> 0:00", () => {
		expect(formatDurationLabel(null)).toBe("0:00");
		expect(formatDurationLabel("")).toBe("0:00");
	});

	it("número positivo -> formata; zero/negativo -> 0:00", () => {
		expect(formatDurationLabel(65)).toBe("1:05");
		expect(formatDurationLabel(0)).toBe("0:00");
		expect(formatDurationLabel(-5)).toBe("0:00");
	});
});

describe("probeAudioDuration", () => {
	it("URL vazia/null -> null sem criar Audio", async () => {
		expect(await probeAudioDuration(null, 100)).toBeNull();
		expect(await probeAudioDuration("", 100)).toBeNull();
	});

	it("metadata carrega com duração válida -> segundos", async () => {
		vi.stubGlobal(
			"Audio",
			class {
				duration = 42.7;
				preload = "";
				src = "";
				addEventListener(type: string, cb: () => void) {
					if (type === "loadedmetadata") queueMicrotask(cb);
				}
				removeEventListener() {}
				setAttribute() {}
				removeAttribute() {}
				load() {}
			} as unknown as typeof Audio,
		);
		expect(await probeAudioDuration("musics/x.mp3", 100)).toBe(42.7);
		vi.unstubAllGlobals();
	});

	it("metadata com duração inválida -> null", async () => {
		vi.stubGlobal(
			"Audio",
			class {
				duration = Number.NaN;
				preload = "";
				src = "";
				addEventListener(type: string, cb: () => void) {
					if (type === "loadedmetadata") queueMicrotask(cb);
				}
				removeEventListener() {}
				removeAttribute() {}
				load() {}
			} as unknown as typeof Audio,
		);
		expect(await probeAudioDuration("musics/x.mp3", 100)).toBeNull();
		vi.unstubAllGlobals();
	});

	it("erro de carga -> null", async () => {
		vi.stubGlobal(
			"Audio",
			class {
				addEventListener(type: string, cb: () => void) {
					if (type === "error") queueMicrotask(cb);
				}
				removeEventListener() {}
				removeAttribute() {}
				load() {}
			} as unknown as typeof Audio,
		);
		expect(await probeAudioDuration("musics/x.mp3", 100)).toBeNull();
		vi.unstubAllGlobals();
	});

	it("timeout -> null", async () => {
		vi.useFakeTimers();
		try {
			vi.stubGlobal(
				"Audio",
				class {
					duration = 1;
					preload = "";
					src = "";
					addEventListener() {}
					removeEventListener() {}
					removeAttribute() {}
					load() {}
				} as unknown as typeof Audio,
			);
			const promise = probeAudioDuration("musics/x.mp3", 50);
			await vi.advanceTimersByTimeAsync(100);
			expect(await promise).toBeNull();
			vi.unstubAllGlobals();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("uploadCustomFile", () => {
	const bytes = new Uint8Array([1, 2, 3]);

	it("upload ok -> idFile/url", async () => {
		const result = await uploadCustomFile(bytes, "a.mp3", "audio");
		expect(result).toEqual({ idFile: 7, url: "/file/a.mp3" });
	});

	it("resposta !ok -> null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, json: async () => ({}) })),
		);
		expect(await uploadCustomFile(bytes, "a.mp3", "audio")).toBeNull();
	});

	it("falha de rede -> null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		expect(await uploadCustomFile(bytes, "a.mp3", "imagens")).toBeNull();
	});
});

describe("enrichDurations", () => {
	it("sem pendências -> false", async () => {
		const rows = [
			{ duration: 10, hasAudio: true, audioUrl: "a.mp3" },
			{ duration: null, hasAudio: false, audioUrl: "b.mp3" },
		];
		expect(await enrichDurations(rows)).toBe(false);
	});

	it("com pendências -> probe preenche e retorna true", async () => {
		vi.stubGlobal(
			"Audio",
			class {
				duration = 30;
				preload = "";
				src = "";
				addEventListener(type: string, cb: () => void) {
					if (type === "loadedmetadata") queueMicrotask(cb);
				}
				removeEventListener() {}
				removeAttribute() {}
				load() {}
			} as unknown as typeof Audio,
		);
		const rows = [
			{ duration: null as number | null, hasAudio: true, audioUrl: "a.mp3" },
			{ duration: null as number | null, hasAudio: true, audioUrl: "b.mp3" },
		];
		const changed = await enrichDurations(rows);
		expect(changed).toBe(true);
		expect(rows[0]?.duration).toBe(30);
		vi.unstubAllGlobals();
	});

	it("probe falhando mantém null e retorna true", async () => {
		vi.stubGlobal(
			"Audio",
			class {
				addEventListener(type: string, cb: () => void) {
					if (type === "error") queueMicrotask(cb);
				}
				removeEventListener() {}
				removeAttribute() {}
				load() {}
			} as unknown as typeof Audio,
		);
		const rows = [
			{ duration: null as number | null, hasAudio: true, audioUrl: "c.mp3" },
		];
		expect(await enrichDurations(rows)).toBe(true);
		expect(rows[0]?.duration).toBeNull();
		vi.unstubAllGlobals();
	});
});
