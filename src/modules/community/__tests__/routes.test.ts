// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { communityRoutes } from "../routes";

// Adendo v1.1.0: 7 rotas — base, cópia (:id), view de cópias, custom (:id),
// view de coletâneas próprias, detalhe público, ranking.
// Adendo premium/clean (23/11): + community-tasks (view própria).
describe("communityRoutes", () => {
	it("define as rotas do módulo com navKey community", () => {
		expect(communityRoutes).toHaveLength(8);
		const byName = new Map(communityRoutes.map((r) => [r.name, r]));
		for (const name of [
			"community",
			"community-copy",
			"community-copies",
			"community-custom",
			"community-my-collections",
			"community-collection",
			"community-ranking",
			"community-tasks",
		]) {
			const route = byName.get(name);
			expect(route, name).toBeDefined();
			expect(route?.meta?.navKey).toBe("community");
		}
		// D3 (SPEC louvorja-community-copies v1.0.0): cópias vivem em rota da
		// aba Comunidade, reusando a tela de detalhe da Central.
		expect(byName.get("community-copy")?.path).toBe(
			"community/copies/:collectionId",
		);
		expect(byName.get("community")?.path).toBe("community");
		expect(byName.get("community-collection")?.path).toBe(
			"community/collections/:collectionId",
		);
		expect(byName.get("community-ranking")?.path).toBe("community/ranking");
		// Adendo v1.1.0: views próprias (sem listas inline na Comunidade).
		expect(byName.get("community-copies")?.path).toBe("community/copies");
		expect(byName.get("community-custom")?.path).toBe(
			"community/custom/:collectionId",
		);
		expect(byName.get("community-my-collections")?.path).toBe(
			"community/my-collections",
		);
	});

	it("AC6: detalhe community/copies/:collectionId REUSA AlbumCollectionView (D3)", async () => {
		const detail = communityRoutes.find(
			(r) => r.path === "community/copies/:collectionId",
		);
		expect(detail).toBeDefined();
		expect(detail?.name).toBe("community-copy");
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
