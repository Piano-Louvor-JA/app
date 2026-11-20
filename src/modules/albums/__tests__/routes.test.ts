import { describe, expect, it } from "vitest";

import { albumsRoutes } from "../routes";

describe("albums routes", () => {
	it("exporta rota de coletâneas com navKey", () => {
		expect(albumsRoutes.length).toBeGreaterThan(0);
		for (const route of albumsRoutes) {
			expect(route.meta).toHaveProperty("navKey");
		}
	});
});
