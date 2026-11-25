// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { communityRoutes } from "../routes";

describe("communityRoutes", () => {
	it("define as rotas do módulo com navKey community", () => {
		expect(communityRoutes).toHaveLength(4);
		const paths = communityRoutes.map((r) => r.path);
		expect(paths).toContain("community");
		expect(paths).toContain("community/copies");
		expect(paths).toContain("community/copies/:collectionId");
		expect(paths).toContain("community/ranking");
		for (const route of communityRoutes) {
			expect(route.meta?.navKey).toBe("community");
		}
		const copies = communityRoutes.find((r) => r.path === "community/copies");
		expect(copies?.name).toBe("community-copies");
		const detail = communityRoutes.find(
			(r) => r.path === "community/copies/:collectionId",
		);
		expect(detail?.name).toBe("community-copies-collection");
	});

	it("AC6: detalhe community/copies/:collectionId REUSA AlbumCollectionView (D3)", async () => {
		const detail = communityRoutes.find(
			(r) => r.path === "community/copies/:collectionId",
		);
		expect(detail).toBeDefined();
		// Mesmo componente da rota /albums/:collectionId — sem duplicação.
		const albumsRoutes = await import("@modules/albums/routes");
		const albumsDetail = albumsRoutes.albumsRoutes.find(
			(r) => r.path === "albums/:collectionId",
		);
		expect(detail?.component).toBe(albumsDetail?.component);
		expect(detail?.component).not.toBe(
			communityRoutes.find((r) => r.path === "community/copies")?.component,
		);
	});
});
