// @vitest-environment jsdom
// app#slja-storage — consumers resolvem mídia IndexedDB via objectURL,
// com fallback legacy (audioBase64/image_url data: inline no localStorage).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getMedia: vi.fn(),
}));

vi.mock("@modules/media/services/local-media-store", () => ({
	putMedia: vi.fn(),
	getMedia: mocks.getMedia,
	deleteMedia: vi.fn(),
}));

import {
	createLocalCollection,
	createLocalMusic,
	updateLocalMusic,
} from "@modules/media/services/local-custom-store";
import { loadCustomMusicTrack } from "../custom-catalog";

describe("loadCustomMusicTrack — mídia local IndexedDB + legacy", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("áudio em IndexedDB resolve como blob: objectURL", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Nova" });
		updateLocalMusic(music.id, {
			audioMediaId: "slja-h-audio",
			audioName: "a.wav",
		});
		mocks.getMedia.mockResolvedValue(
			new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
		);

		const track = await loadCustomMusicTrack(music.id);
		expect(mocks.getMedia).toHaveBeenCalledWith("slja-h-audio");
		expect(track?.audioUrl).toMatch(/^blob:/);
	});

	it("capa em IndexedDB resolve como blob: objectURL", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Nova" });
		updateLocalMusic(music.id, { coverMediaId: "slja-h-cover" });
		mocks.getMedia.mockResolvedValue(
			new Blob([new Uint8Array([9])], { type: "image/png" }),
		);

		const track = await loadCustomMusicTrack(music.id);
		expect(track?.coverUrl).toMatch(/^blob:/);
	});

	it("legacy audioBase64 → data: URL (não quebra música pré-fix)", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Antiga" });
		updateLocalMusic(music.id, { audioBase64: "QUJD" });

		const track = await loadCustomMusicTrack(music.id);
		expect(track?.audioUrl).toBe("data:audio/mpeg;base64,QUJD");
	});

	it("legacy image_url data: → usada como está", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "Antiga" });
		updateLocalMusic(music.id, { image_url: "data:image/png;base64,QUJD" });

		const track = await loadCustomMusicTrack(music.id);
		expect(track?.coverUrl).toBe("data:image/png;base64,QUJD");
	});

	it("IndexedDB indisponível (getMedia null) → sem áudio, sem crash", async () => {
		const col = createLocalCollection("C");
		const music = createLocalMusic(col.id, { name: "SemMidia" });
		updateLocalMusic(music.id, { audioMediaId: "slja-h-audio" });
		mocks.getMedia.mockResolvedValue(null);

		const track = await loadCustomMusicTrack(music.id);
		expect(track).not.toBeNull();
		expect(track?.audioUrl).toBeNull();
	});
});
