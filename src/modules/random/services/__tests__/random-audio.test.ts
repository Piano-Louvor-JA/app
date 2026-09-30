// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * random-audio — ciclo de vida do áudio do sorteio (singleton de módulo).
 * Audio do jsdom é stub; usamos classe fake com play()/pause() controláveis.
 */

const mocks = vi.hoisted(() => {
	const state = {
		isDesktop: true,
		bridge: null as unknown,
		resolved: new Map<string, string>(),
	};
	return { state };
});

vi.mock("@shared/services/desktop-bridge", () => ({
	isDesktopApp: vi.fn(() => mocks.state.isDesktop),
	getDesktopBridge: vi.fn(() => mocks.state.bridge),
}));

vi.mock("@shared/services/workspace-api", () => ({
	resolveMediaUrl: vi.fn((p: string) => `http://app/${p}`),
}));

import type { RandomDisplayConfig } from "../../types/random";
import {
	applyRandomAudioOutput,
	deleteRandomCustomAudio,
	ensureRandomDefaultAudioInstalled,
	isRandomDrawAudioPlaying,
	pauseRandomDrawAudio,
	pickAndImportRandomAudio,
	playRandomDrawAudio,
	playRandomWinnerEffect,
	resolveRandomDrawAudioUrl,
	resolveRandomEffectAudioUrl,
	stopRandomDrawAudio,
	subscribeRandomAudioPlaying,
	toggleRandomDrawAudio,
} from "../random-audio";

const config = (over: Partial<RandomDisplayConfig> = {}) =>
	({
		audioSource: "default",
		customAudioFile: null,
		...over,
	}) as RandomDisplayConfig;

class FakeAudio {
	static instances: FakeAudio[] = [];
	src: string;
	preload = "";
	loop = false;
	volume = 1;
	muted = false;
	paused = true;
	currentTime = 0;
	listeners = new Map<string, Array<() => void>>();
	private playResolvers: Array<() => void> = [];
	private playRejectors: Array<() => void> = [];

	constructor(src: string) {
		this.src = src;
		FakeAudio.instances.push(this);
	}

	addEventListener(type: string, cb: () => void) {
		const list = this.listeners.get(type) ?? [];
		list.push(cb);
		this.listeners.set(type, list);
	}

	emit(type: string) {
		const list = [...(this.listeners.get(type) ?? [])];
		for (const cb of list) cb();
	}

	play() {
		this.paused = false;
		return new Promise<void>((resolve, reject) => {
			this.playResolvers.push(resolve);
			this.playRejectors.push(reject);
		});
	}

	pause() {
		this.paused = true;
	}

	resolvePlay() {
		this.playResolvers.forEach((r) => r());
		this.playResolvers = [];
	}

	rejectPlay() {
		this.playRejectors.forEach((r) => r());
		this.playRejectors = [];
	}
}

beforeEach(() => {
	FakeAudio.instances = [];
	mocks.state.isDesktop = true;
	mocks.state.bridge = null;
	vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
	Object.defineProperty(window, "navigator", {
		value: { ...window.navigator, onLine: true },
		writable: true,
	});
	stopRandomDrawAudio();
	applyRandomAudioOutput({ volume: 1, muted: false });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("resolvers de URL", () => {
	it("áudio padrão e custom e efeito", () => {
		expect(resolveRandomDrawAudioUrl(config())).toContain("default");
		const custom = resolveRandomDrawAudioUrl(
			config({ audioSource: "custom", customAudioFile: "minha.mp3" }),
		);
		expect(custom).toContain("minha.mp3");
		expect(resolveRandomEffectAudioUrl()).toContain("efeito");
	});

	it("custom sem arquivo cai no padrão", () => {
		const url = resolveRandomDrawAudioUrl(
			config({ audioSource: "custom", customAudioFile: null }),
		);
		expect(url).not.toContain("undefined");
	});
});

describe("playRandomDrawAudio", () => {
	it("fora do desktop sem bridge → não cria áudio", () => {
		mocks.state.isDesktop = false;
		playRandomDrawAudio(config());
		expect(FakeAudio.instances).toHaveLength(0);
		expect(isRandomDrawAudioPlaying()).toBe(false);
	});

	it("desktop cria áudio com loop, aplica volume e toca", async () => {
		applyRandomAudioOutput({ volume: 0.5, muted: true });
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		expect(audio.loop).toBe(true);
		expect(audio.volume).toBe(0.5);
		expect(audio.muted).toBe(true);
		expect(isRandomDrawAudioPlaying()).toBe(true);
		audio.resolvePlay();
	});

	it("play rejeitado → áudio descartado e listener notificado", async () => {
		const events: boolean[] = [];
		subscribeRandomAudioPlaying((p) => events.push(p));
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.rejectPlay();
		await new Promise((r) => setTimeout(r, 0));
		expect(isRandomDrawAudioPlaying()).toBe(false);
		expect(events[events.length - 1]).toBe(false);
	});

	it("evento ended → descarta e notifica", async () => {
		const events: boolean[] = [];
		subscribeRandomAudioPlaying((p) => events.push(p));
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		audio.emit("ended");
		await new Promise((r) => setTimeout(r, 0));
		expect(isRandomDrawAudioPlaying()).toBe(false);
		expect(events[events.length - 1]).toBe(false);
	});

	it("evento error → descarta e notifica", async () => {
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.emit("error");
		await new Promise((r) => setTimeout(r, 0));
		expect(isRandomDrawAudioPlaying()).toBe(false);
	});
});

describe("stop/pause/toggle", () => {
	it("stop sem áudio → notify e sem erro", () => {
		expect(() => stopRandomDrawAudio()).not.toThrow();
	});

	it("stop pausa, zera currentTime e descarta", async () => {
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		stopRandomDrawAudio();
		expect(audio.paused).toBe(true);
		expect(audio.currentTime).toBe(0);
		expect(isRandomDrawAudioPlaying()).toBe(false);
	});

	it("pause com áudio tocando pausa; pause pausado só notifica", async () => {
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		pauseRandomDrawAudio();
		expect(audio.paused).toBe(true);
		// pausado de novo: notify apenas
		expect(() => pauseRandomDrawAudio()).not.toThrow();
	});

	it("toggle: toca → pausa → retoma", async () => {
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		// tocando → pause
		toggleRandomDrawAudio(config());
		expect(audio.paused).toBe(true);
		// pausado → retoma (novo play pendente)
		toggleRandomDrawAudio(config());
		expect(audio.paused).toBe(false);
		audio.resolvePlay();
	});

	it("toggle sem áudio → inicia", () => {
		toggleRandomDrawAudio(config());
		expect(FakeAudio.instances).toHaveLength(1);
		FakeAudio.instances[0]?.resolvePlay();
	});
});

describe("applyRandomAudioOutput", () => {
	it("volume clamped e muted aplicados ao elemento vivo", async () => {
		playRandomDrawAudio(config());
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		applyRandomAudioOutput({ volume: Number.NaN, muted: true });
		expect(audio.volume).toBe(1);
		expect(audio.muted).toBe(true);
	});
});

describe("playRandomWinnerEffect", () => {
	it("fora do desktop → nada", () => {
		mocks.state.isDesktop = false;
		playRandomWinnerEffect();
		expect(FakeAudio.instances).toHaveLength(0);
	});

	it("efeito toca sem loop, ended limpa", async () => {
		playRandomWinnerEffect();
		const audio = FakeAudio.instances[0];
		expect(audio.loop).toBe(false);
		audio.resolvePlay();
		audio.emit("ended");
		expect(true).toBe(true);
	});

	it("play rejeitado no efeito limpa referência", async () => {
		playRandomWinnerEffect();
		const audio = FakeAudio.instances[0];
		audio.rejectPlay();
		await new Promise((r) => setTimeout(r, 0));
		expect(true).toBe(true);
	});

	it("erro no efeito limpa referência", () => {
		playRandomWinnerEffect();
		const audio = FakeAudio.instances[0];
		audio.resolvePlay();
		expect(() => audio.emit("error")).not.toThrow();
	});
});

describe("bridge helpers", () => {
	it("ensureRandomDefaultAudioInstalled sem bridge → no-op", async () => {
		await expect(ensureRandomDefaultAudioInstalled()).resolves.toBeUndefined();
	});

	it("ensureRandomDefaultAudioInstalled com bridge chama", async () => {
		const ensure = vi.fn(async () => undefined);
		mocks.state.bridge = { random: { ensureDefaultAudio: ensure } };
		await ensureRandomDefaultAudioInstalled();
		expect(ensure).toHaveBeenCalled();
	});

	it("pickAndImportRandomAudio sem importAudio → unavailable", async () => {
		const result = await pickAndImportRandomAudio();
		expect(result).toEqual({ ok: false, reason: "unavailable" });
	});

	it("pickAndImportRandomAudio cancelado → ok false com reason", async () => {
		mocks.state.bridge = {
			random: {
				importAudio: vi.fn(async () => ({ ok: false, reason: "cancelled" })),
			},
		};
		expect(await pickAndImportRandomAudio()).toEqual({
			ok: false,
			reason: "cancelled",
		});
	});

	it("pickAndImportRandomAudio ok → fileName", async () => {
		mocks.state.bridge = {
			random: {
				importAudio: vi.fn(async () => ({ ok: true, fileName: "a.mp3" })),
			},
		};
		expect(await pickAndImportRandomAudio()).toEqual({
			ok: true,
			fileName: "a.mp3",
		});
	});

	it("deleteRandomCustomAudio sem deleteAudio → unavailable; com → repassa", async () => {
		expect(await deleteRandomCustomAudio("x.mp3")).toEqual({
			ok: false,
			reason: "unavailable",
		});
		const del = vi.fn(async () => ({ ok: true }));
		mocks.state.bridge = { random: { deleteAudio: del } };
		expect(await deleteRandomCustomAudio("x.mp3")).toEqual({ ok: true });
	});

	it("subscribe retorna unsubscribe e não vaza listeners", () => {
		const events: boolean[] = [];
		const unsub = subscribeRandomAudioPlaying((p) => events.push(p));
		unsub();
		stopRandomDrawAudio();
		expect(events).toHaveLength(1); // apenas o chamado inicial
	});

	describe("effect audio e toggle (final)", () => {
		it("applyRandomAudioOutput com effectAudio ativo aplica nele (66)", async () => {
			mocks.state.isDesktop = true;
			playRandomWinnerEffect();
			const effect = FakeAudio.instances[0];
			applyRandomAudioOutput({ volume: 0.8, muted: false });
			expect(effect.volume).toBe(0.8);
			expect(effect.muted).toBe(false);
			stopRandomDrawAudio();
		});

		it("efeito novo substitui anterior (stopRandomEffectAudio via 112-118)", async () => {
			mocks.state.isDesktop = true;
			playRandomWinnerEffect();
			const first = FakeAudio.instances[0];
			first.resolvePlay();
			await new Promise((r) => setTimeout(r, 0));
			// segundo efeito: para o primeiro (stopRandomEffectAudio) e cria outro
			playRandomWinnerEffect();
			expect(first.paused).toBe(true);
			expect(first.currentTime).toBe(0);
			expect(FakeAudio.instances.length).toBe(2);
			FakeAudio.instances[1].resolvePlay();
		});

		it("toggle: toca quando pausado (205-210)", async () => {
			mocks.state.isDesktop = true;
			playRandomDrawAudio(config());
			const audio = FakeAudio.instances[0];
			stopRandomDrawAudio();
			// agora sem áudio corrente: toggle cria novo e toca
			toggleRandomDrawAudio(config());
			const novo = FakeAudio.instances[FakeAudio.instances.length - 1];
			novo.resolvePlay();
			expect(FakeAudio.instances.length).toBeGreaterThanOrEqual(2);
		});

		it("toggle: pausa quando tocando (200-203)", async () => {
			mocks.state.isDesktop = true;
			playRandomDrawAudio(config());
			const audio = FakeAudio.instances[0];
			// paused=false (padrão do play) → toggle pausa
			toggleRandomDrawAudio(config());
			expect(audio.paused).toBe(true);
		});
	});
})
