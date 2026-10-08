// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

/**
 * BlurContainer — aplica backdrop-filter do token explícito ou do sistema.
 * O jsdom renderiza :style objeto, mas ler via internals do instance é mais
 * robusto que parsear o atributo.
 */

const mocks = vi.hoisted(() => ({
	backdropFilter: { value: "blur(18px) saturate(140%)" },
	currentBlur: { value: "18px" },
}));

vi.mock("@design-system/composables", () => ({
	useBlurSystem: () => ({
		backdropFilter: mocks.backdropFilter,
		currentBlur: mocks.currentBlur,
	}),
}));

import BlurContainer from "../BlurContainer.vue";

function styleOf(wrapper: ReturnType<typeof mount>): Record<string, string> {
	const instance = wrapper.vm.$ as unknown as {
		setupState: Record<string, unknown>;
	};
	const raw = instance.setupState?.style as unknown as {
		value?: Record<string, string>;
	};
	return raw?.value ?? (raw as unknown as Record<string, string>) ?? {};
}

describe("BlurContainer", () => {
	it("renderiza slot com classe raiz", () => {
		const wrapper = mount(BlurContainer, {
			slots: { default: "<p>conteúdo</p>" },
		});
		expect(wrapper.html()).toContain("ds-blur-container");
		expect(wrapper.text()).toContain("conteúdo");
	});

	it("sem prop level -> usa o blur ativo do sistema", () => {
		const wrapper = mount(BlurContainer, {});
		const style = styleOf(wrapper);
		expect(style.backdropFilter).toBe("blur(18px) saturate(140%)");
		expect(style.WebkitBackdropFilter).toBe("blur(18px) saturate(140%)");
	});

	it("com prop level -> token e filter manual (ambos os ramos)", () => {
		const wrapper = mount(BlurContainer, { props: { level: "none" } });
		const style = styleOf(wrapper);
		expect(style.backdropFilter).toBe("blur(0px) saturate(140%)");
		expect(style.WebkitBackdropFilter).toBe("blur(0px) saturate(140%)");
	});

	it("level high -> blur do token", () => {
		const wrapper = mount(BlurContainer, { props: { level: "high" } });
		expect(styleOf(wrapper).backdropFilter).toBe("blur(28px) saturate(140%)");
	});
});
