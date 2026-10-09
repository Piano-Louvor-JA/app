import { describe, expect, it } from "vitest";

import { liturgyRoutes } from "../routes";

describe("liturgy routes", () => {
	it("exporta a rota liturgy", () => {
		expect(liturgyRoutes).toHaveLength(1);
		const route = liturgyRoutes[0];
		expect(route.path).toBe("liturgy");
		expect(route.name).toBe("liturgy");
		expect(route.meta).toEqual({ navKey: "liturgy" });
		expect(typeof route.component).toBe("object");
	});
});
