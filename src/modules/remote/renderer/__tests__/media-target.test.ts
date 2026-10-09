import { describe, expect, it } from "vitest";

import { resolveMediaTarget } from "../media-target";

describe("resolveMediaTarget", () => {
	it("sem projection → player", async () => {
		expect(await resolveMediaTarget({ player: {} })).toBe("player");
	});

	it("projection sem getPlaybackState → player", async () => {
		expect(await resolveMediaTarget({ projection: {}, player: {} })).toBe(
			"player",
		);
	});

	it("getPlaybackState retorna estado → projection", async () => {
		const target = await resolveMediaTarget({
			projection: { getPlaybackState: async () => ({ active: true }) },
			player: {},
		});
		expect(target).toBe("projection");
	});

	it("getPlaybackState retorna null → player", async () => {
		const target = await resolveMediaTarget({
			projection: { getPlaybackState: async () => null },
			player: {},
		});
		expect(target).toBe("player");
	});

	it("getPlaybackState rejeita → player", async () => {
		const target = await resolveMediaTarget({
			projection: {
				getPlaybackState: async () => {
					throw new Error("boom");
				},
			},
			player: {},
		});
		expect(target).toBe("player");
	});
});
