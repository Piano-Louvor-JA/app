// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { communityRoutes } from "../routes";

describe("communityRoutes", () => {
	it("define as 2 rotas do módulo com navKey community", () => {
		expect(communityRoutes).toHaveLength(2);
		const [community, ranking] = communityRoutes;
		expect(community.path).toBe("community");
		expect(community.name).toBe("community");
		expect(ranking.path).toBe("community/ranking");
		expect(ranking.name).toBe("community-ranking");
		expect(community.meta?.navKey).toBe("community");
		expect(ranking.meta?.navKey).toBe("community");
	});
});
