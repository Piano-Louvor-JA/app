import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const interactionKey = ref("dynamic");
const currentInteraction = ref({ pageTransition: "page-dynamic" });

vi.mock("../useThemeManager", () => ({
	useThemeManager: () => ({ interactionKey, currentInteraction }),
}));

import { usePageTransition } from "../usePageTransition";

describe("usePageTransition", () => {
	it("expõe o transitionName do tema dinâmico", () => {
		const { transitionName, isSoft } = usePageTransition();
		expect(transitionName.value).toBe("page-dynamic");
		expect(isSoft.value).toBe(false);
	});

	it("reflete o tema suave", () => {
		interactionKey.value = "soft";
		currentInteraction.value = { pageTransition: "page-fade" };
		const { transitionName, isSoft } = usePageTransition();
		expect(transitionName.value).toBe("page-fade");
		expect(isSoft.value).toBe(true);
	});
});
