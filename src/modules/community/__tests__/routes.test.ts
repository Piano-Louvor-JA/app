// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { communityRoutes } from "../routes";

describe("communityRoutes", () => {
	it("define as 3 rotas do módulo com navKey community (lista, detalhe, ranking)", () => {
		expect(communityRoutes).toHaveLength(3);
		const [community, detail, ranking] = communityRoutes;
		expect(community.path).toBe("community");
		expect(community.name).toBe("community");
		expect(detail.path).toBe("community/collections/:collectionId");
		expect(detail.name).toBe("community-collection");
		expect(ranking.path).toBe("community/ranking");
		expect(ranking.name).toBe("community-ranking");
		expect(community.meta?.navKey).toBe("community");
		expect(detail.meta?.navKey).toBe("community");
		expect(ranking.meta?.navKey).toBe("community");
	});
});
