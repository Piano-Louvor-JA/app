import { describe, expect, it, vi } from "vitest";

import { useHomeClock } from "../useHomeClock";

vi.mock("@modules/clock/composables/useClock", () => ({
	useClockTick: vi.fn(() => ({
		now: { value: new Date(2026, 8, 21, 9, 5, 3) },
	})),
}));

describe("useHomeClock", () => {
	it("formata HH:MM:SS com zero à esquerda", () => {
		const { formattedTime } = useHomeClock();
		expect(formattedTime.value).toBe("09:05:03");
	});
});
