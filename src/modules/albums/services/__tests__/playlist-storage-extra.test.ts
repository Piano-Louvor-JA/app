// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Complemento playlist-storage — ramos de corrupção e bordas de índice.
 */
import {
	addPlaylistItem,
	createPlaylist,
	deletePlaylist,
	listPlaylists,
	type Playlist,
	removePlaylistItem,
	renamePlaylist,
	savePlaylists,
} from "../playlist-storage";

const KEY = "louvorja.playlists.v1";

beforeEach(() => {
	localStorage.clear();
});

describe("read — corrupção", () => {
	it("JSON inválido -> []", () => {
		localStorage.setItem(KEY, "{quebrado");
		expect(listPlaylists()).toEqual([]);
	});

	it("payload não-array -> []", () => {
		localStorage.setItem(KEY, '{"a":1}');
		expect(listPlaylists()).toEqual([]);
	});
});

describe("rename/delete/add — ids inexistentes e bordas", () => {
	it("rename inexistente -> null", () => {
		expect(renamePlaylist("x", "n")).toBeNull();
	});

	it("delete inexistente -> false", () => {
		expect(deletePlaylist("x")).toBe(false);
	});

	it("addPlaylistItem em playlist inexistente -> null", () => {
		expect(
			addPlaylistItem("x", { musicId: 1, albumId: null, title: "t" }),
		).toBeNull();
	});

	it("removePlaylistItem índice fora -> null", () => {
		const p = createPlaylist("L");
		expect(removePlaylistItem(p.id, 0)).toBeNull();
		expect(removePlaylistItem(p.id, -1)).toBeNull();
	});

	it("add duplicado consecutivo -> added false sem push", () => {
		const p = createPlaylist("L");
		const item = { musicId: 1, albumId: null, title: "A" };
		const first = addPlaylistItem(p.id, item);
		expect(first?.added).toBe(true);
		const second = addPlaylistItem(p.id, item);
		expect(second?.added).toBe(false);
		expect(second?.playlist.items).toHaveLength(1);
	});

	it("add mesma música com albumId diferente -> added true", () => {
		const p = createPlaylist("L");
		addPlaylistItem(p.id, { musicId: 1, albumId: null, title: "A" });
		const r = addPlaylistItem(p.id, { musicId: 1, albumId: 7, title: "A" });
		expect(r?.added).toBe(true);
	});

	it("savePlaylists importa lista externa", () => {
		const external: Playlist[] = [
			{
				id: "e1",
				name: "Importada",
				items: [],
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
			},
		];
		savePlaylists(external);
		expect(listPlaylists()).toHaveLength(1);
		expect(listPlaylists()[0]?.name).toBe("Importada");
	});
	it("read com localStorage quebrado: catch → [] (25)", () => {
		const orig = localStorage.getItem;
		localStorage.getItem = () => {
			throw new Error("storage quebrado");
		};
		try {
			expect(listPlaylists()).toEqual([]);
		} finally {
			localStorage.getItem = orig;
		}
	});
});
