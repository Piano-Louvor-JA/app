import { describe, expect, it } from "vitest";

import { homeRoutes } from "../routes";

describe("home routes", () => {
	it("exporta a rota home na raiz", () => {
		expect(homeRoutes).toHaveLength(1);
		const route = homeRoutes[0];
		expect(route.path).toBe("");
		expect(route.name).toBe("home");
		expect(route.meta).toEqual({ navKey: "home" });
		expect(typeof route.component).toBe("object");
	});
});
