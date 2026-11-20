import { describe, expect, it } from "vitest";

import { mediaRoutes } from "../routes";

describe("media routes", () => {
	it("exporta rotas com meta navKey de mídia", () => {
		expect(mediaRoutes.length).toBeGreaterThan(0);
		for (const route of mediaRoutes) {
			expect(route.meta).toHaveProperty("navKey");
		}
	});
});
