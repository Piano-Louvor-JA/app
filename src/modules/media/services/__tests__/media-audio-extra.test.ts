// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento media-audio — ramos: VITE_URL_FILES custom, Audio API ausente,
 * fadeOut early-return e fadeIn com meta 0.
 */

const mocks = vi.hoisted(() => ({
	isDesktop: false,
	bridge: null as unknown,
}));

vi.mock("@shared/services/desktop-bridge", () => ({
	isDesktopApp: vi.fn(() => mocks.isDesktop),
	getDesktopBridge: vi.fn(() => mocks.bridge),
}));

import {
	fadeInMediaAudio,
	fadeOutMediaAudio,
	fadeVolumeMediaAudio,
	resolveRemoteFileUrl,
} from "../media-audio";

beforeEach(() => {
	mocks.isDesktop = false;
	mocks.bridge = null;
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("resolveRemoteFileUrl — VITE_URL_FILES custom", () => {
	it("base customizada é usada", () => {
		vi.stubEnv("VITE_URL_FILES", "https://files.custom");
		expect(resolveRemoteFileUrl("musics/1.mp3")).toBe(
			"https://files.custom/musics/1.mp3",
		);
	});

	it("sem env → base oficial", () => {
		vi.stubEnv("VITE_URL_FILES", undefined as never);
		const url = resolveRemoteFileUrl("musics/1.mp3");
		expect(url).toContain("api.pianolouvorja.com.br");
	});
});

describe("fadeVolume — ramos residuais", () => {
	function fakeAudio(volume: number, paused = false) {
		return {
			volume,
			paused,
			pause: vi.fn(),
			play: vi.fn(async () => undefined),
		} as unknown as HTMLAudioElement & {
			pause: ReturnType<typeof vi.fn>;
			play: ReturnType<typeof vi.fn>;
		};
	}

	it("fadeOut com volume já 0 → pausa imediata sem fade", async () => {
		const audio = fakeAudio(0);
		await fadeOutMediaAudio(audio);
		expect(audio.pause).toHaveBeenCalled();
	});

	it("fadeOut pausado → volume 0 e pausa", async () => {
		const audio = fakeAudio(0.5, true);
		await fadeOutMediaAudio(audio);
		expect(audio.volume).toBe(0);
		expect(audio.pause).toHaveBeenCalled();
	});

	it("fadeOut normal faz o fade até silêncio e pausa", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			const audio = fakeAudio(1);
			const promise = fadeOutMediaAudio(audio, 100);
			await vi.advanceTimersByTimeAsync(200);
			await promise;
			expect(audio.pause).toHaveBeenCalled();
			expect(audio.volume).toBeLessThanOrEqual(0.01);
		} finally {
			vi.useRealTimers();
		}
	});

	it("fadeIn com meta 0 -> volume 0", async () => {
		const audio = fakeAudio(1);
		await fadeInMediaAudio(audio, 0);
		expect(audio.volume).toBe(0);
	});

	it("fadeIn com meta válida sobe o volume", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			const audio = fakeAudio(1);
			const promise = fadeInMediaAudio(audio, 0.8, 100);
			await vi.advanceTimersByTimeAsync(200);
			const result = await promise;
			expect(result).toBe(true);
			expect(audio.volume).toBeGreaterThan(0.5);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("fadeOut cancelado por fade concorrente", () => {
	it("fadeOut interrompido por outro fadeVolume não pausa (171)", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			const audio = {
				volume: 0.9,
				paused: false,
				pause: vi.fn(),
				play: vi.fn(async () => undefined),
			} as unknown as HTMLAudioElement & { pause: ReturnType<typeof vi.fn> };
			const out = fadeOutMediaAudio(audio, 10_000); // fade longo
			await vi.advanceTimersByTimeAsync(60);
			// outro fade (subida) cancela o fadeOut via clearMediaAudioFade
			const up = fadeVolumeMediaAudio(audio, 1, 10_000);
			await vi.advanceTimersByTimeAsync(100);
			await out;
			// guard 171: volume não está em silêncio -> sem pausa
			expect(audio.pause).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(11_000);
			await up;
			expect(audio.volume).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	describe("Audio API ausente (78)", () => {
		it("ensureSlotAudio lança Audio API unavailable", async () => {
			const origAudio = globalThis.Audio;
			// @ts-expect-error simula ambiente sem Audio
			delete (globalThis as { Audio?: unknown }).Audio;
			try {
				const r = await fadeInMediaAudio({ volume: 0.5 } as unknown as HTMLAudioElement, 0.5);
				expect(r).toBe(false);
			} finally {
				(globalThis as { Audio?: unknown }).Audio = origAudio;
			}
		});
	});
})

describe("media-audio — attach sem handlers opcionais (B245)", () => {
	it("attachMediaAudioListeners com objeto vazio: nenhum addEventListener", async () => {
		const { attachMediaAudioListeners } = await import("../media-audio");
		const audio = document.createElement("audio");
		const spy = vi.spyOn(audio, "addEventListener");
		attachMediaAudioListeners(audio, {});
		expect(spy).not.toHaveBeenCalled();
	});
});
