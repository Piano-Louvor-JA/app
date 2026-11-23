// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * RF-03 + SPEC louvorja-community-copies v1.0.0: pós-cópia a navegação cai
 * em /community/copies/:collectionId com o id local CRU (negativo).
 * buildCommunityCopyCard resolve o card sob demanda — a cópia NÃO entra na
 * categoria custom da Central (vive só na aba Comunidade).
 */

const mocks = vi.hoisted(() => ({
	loadAlbumCategories: vi.fn(async () => []),
	buildCommunityCopyCard: vi.fn((id: string) =>
		id === "-1"
			? {
					id: 2_000_000 - 1,
					kind: "album",
					name: "Cópia Comunidade",
					subtitle: "",
					coverUrl: null,
					trackCount: 2,
					catalogKey: "custom_collection_-1",
					isCustom: true,
				}
			: null,
	),
	buildCustomCollectionCard: vi.fn(() => null),
	loadCollectionTracks: vi.fn(async () => [
		{ musicId: 555, name: "Hino A", track: 1, durationLabel: "3:00", hasInstrumental: false },
	]),
}));

vi.mock("../../services/album-catalog", () => ({
	findCollectionById: (categories: Array<{ collections?: Array<{ id: unknown }> }>, id: string) => {
		for (const category of categories) {
			for (const collection of category.collections ?? []) {
				if (String(collection.id) === id) return collection;
			}
		}
		return null;
	},
	loadAlbumCategories: mocks.loadAlbumCategories,
	buildCommunityCopyCard: mocks.buildCommunityCopyCard,
	buildCustomCollectionCard: mocks.buildCustomCollectionCard,
}));
vi.mock("../../services/album-tracks", () => ({
	filterAlbumTracks: (xs: unknown[]) => xs,
	loadAlbumLyric: vi.fn(async () => null),
	loadCollectionTracks: mocks.loadCollectionTracks,
}));
vi.mock("../../services/album-music-search", () => ({
	filterAlbumMusicIndex: vi.fn(() => []),
	loadAlbumMusicIndex: vi.fn(async () => []),
}));
vi.mock("@modules/media/services/open-music-player", () => ({
	openMusicPlayer: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@modules/media/services/local-custom-store", () => ({
	isLocalId: (id: number | string | null | undefined) => Number(id) < 0,
}));
vi.mock("@shared/services/workspace-api", () => ({
	readCatalogRecord: vi.fn(async () => null),
	writeCatalogRecord: vi.fn(async () => true),
}));
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: () => null,
	isDesktopApp: () => false,
	isElectronShell: () => false,
}));

import { useAlbumsStore } from "../useAlbumsStore";

describe("openCollection — cópia local da Comunidade abre no destino (RF-03)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		localStorage.clear();
	});

	it("id local CRU da cópia (-1) abre via buildCommunityCopyCard sob demanda", async () => {
		const store = useAlbumsStore();
		const ok = await store.openCollection("-1");
		expect(ok).toBe(true);
		expect(mocks.buildCommunityCopyCard).toHaveBeenCalledWith("-1");
		expect(store.activeCollection?.name).toBe("Cópia Comunidade");
		expect(store.tracks).toHaveLength(1);
		expect(store.lastErrorKey).toBeNull();
	});

	it("id inexistente continua mostrando collectionMissing (sem máscara)", async () => {
		const store = useAlbumsStore();
		const ok = await store.openCollection("-99");
		expect(ok).toBe(false);
		expect(store.lastErrorKey).toBe("albums.messages.collectionMissing");
	});

	it("ID oficial ausente: buildCustomCollectionCard tentado, depois collectionMissing", async () => {
		const store = useAlbumsStore();
		const ok = await store.openCollection("999");
		expect(ok).toBe(false);
		expect(mocks.buildCustomCollectionCard).toHaveBeenCalledWith("999");
		expect(store.lastErrorKey).toBe("albums.messages.collectionMissing");
	});
});
