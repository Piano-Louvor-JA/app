// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { communityRoutes } from "../routes";

describe("communityRoutes", () => {
	it("define as 4 rotas do módulo com navKey community (lista, cópia, detalhe, ranking)", () => {
		expect(communityRoutes).toHaveLength(4);
		const [community, copy, detail, ranking] = communityRoutes;
		expect(community.path).toBe("community");
		expect(community.name).toBe("community");
		// D3 (SPEC louvorja-community-copies v1.0.0): cópias vivem em rota da
		// aba Comunidade, reusando a tela de detalhe da Central.
		expect(copy.path).toBe("community/copies/:collectionId");
		expect(copy.name).toBe("community-copy");
		expect(copy.meta?.navKey).toBe("community");
		expect(detail.path).toBe("community/collections/:collectionId");
		expect(detail.name).toBe("community-collection");
		expect(ranking.path).toBe("community/ranking");
		expect(ranking.name).toBe("community-ranking");
		expect(community.meta?.navKey).toBe("community");
		expect(detail.meta?.navKey).toBe("community");
		expect(ranking.meta?.navKey).toBe("community");
	});
});
