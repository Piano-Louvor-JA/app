// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * RF-03 (SPEC comunidade-acesso-copia): pós-cópia a navegação cai em
 * /albums/:collectionId usa o namespace custom: id local -1 vira 1999999.
 * Com SHOW_CUSTOM_COLLECTIONS=false a categoria custom não está no catálogo —
 * openCollection DEVE hidratá-la sob demanda e abrir a cópia (falha de campo
 * 21/11: "Coletânea não encontrada" + lista vazia).
 */

const mocks = vi.hoisted(() => ({
	loadAlbumCategories: vi.fn(async () => []),
	loadCustomAlbumCategory: vi.fn(async () => ({
		id: "custom",
		name: "Minhas Coletâneas",
		collections: [
			{
				id: 2_000_000 - 1,
				kind: "album",
				name: "Cópia Comunidade",
				subtitle: "",
				coverUrl: null,
				trackCount: 2,
				catalogKey: "custom_collection_-1",
				isCustom: true,
			},
		],
	})),
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
	loadCustomAlbumCategory: mocks.loadCustomAlbumCategory,
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

	it("ID custom de cópia local com flag custom OFF: hidrata sob demanda e abre a cópia", async () => {
		const store = useAlbumsStore();
		const ok = await store.openCollection("1999999");
		expect(ok).toBe(true);
		expect(mocks.loadCustomAlbumCategory).toHaveBeenCalled();
		expect(store.activeCollection?.name).toBe("Cópia Comunidade");
		expect(store.tracks).toHaveLength(1);
		expect(store.lastErrorKey).toBeNull();
	});

	it("id inexistente continua mostrando collectionMissing (sem máscara)", async () => {
		mocks.loadCustomAlbumCategory.mockResolvedValue({
			id: "custom",
			name: "Minhas Coletâneas",
			collections: [],
		});
		const store = useAlbumsStore();
		const ok = await store.openCollection("-99");
		expect(ok).toBe(false);
		expect(store.lastErrorKey).toBe("albums.messages.collectionMissing");
	});

	it("ID oficial ausente tenta a categoria custom antes de manter collectionMissing", async () => {
		const store = useAlbumsStore();
		const ok = await store.openCollection("999");
		expect(ok).toBe(false);
		expect(mocks.loadCustomAlbumCategory).toHaveBeenCalled();
		expect(store.lastErrorKey).toBe("albums.messages.collectionMissing");
	});
});
