// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import UpdateBanner from "../UpdateBanner.vue";

// Mock do composable
vi.mock("../../composables/useUpdateChecker", () => ({
	useUpdateChecker: vi.fn(),
}));

import { useUpdateChecker } from "../../composables/useUpdateChecker";

function mockComposable(
	overrides: Partial<ReturnType<typeof useUpdateChecker>> = {},
) {
	const defaults = {
		hasUpdate: ref(false),
		newVersion: ref<string | null>(null),
		dismissed: ref(false),
		dismiss: vi.fn(),
		init: vi.fn(),
		checkForUpdates: vi.fn(),
		downloadUpdate: vi.fn(),
		installUpdate: vi.fn(),
	};
	const merged = { ...defaults, ...overrides };
	vi.mocked(useUpdateChecker).mockReturnValue(merged as any);
	return merged;
}

describe("UpdateBanner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("não renderiza quando não há update", () => {
		mockComposable();
		const wrapper = mount(UpdateBanner);
		expect(wrapper.find('[data-test="update-banner"]').exists()).toBe(false);
	});

	it("não renderiza quando dismissed=true", () => {
		mockComposable({
			hasUpdate: ref(true),
			newVersion: ref("2.0.0"),
			dismissed: ref(true),
		});
		const wrapper = mount(UpdateBanner);
		expect(wrapper.find('[data-test="update-banner"]').exists()).toBe(false);
	});

	it("renderiza quando há update e não dismissed", () => {
		mockComposable({
			hasUpdate: ref(true),
			newVersion: ref("2.0.0"),
			dismissed: ref(false),
		});
		const wrapper = mount(UpdateBanner);
		expect(wrapper.find('[data-test="update-banner"]').exists()).toBe(true);
		expect(wrapper.text()).toContain("2.0.0");
	});

	it("chama dismiss ao clicar em Dispensar", async () => {
		const mock = mockComposable({
			hasUpdate: ref(true),
			newVersion: ref("2.0.0"),
		});
		const wrapper = mount(UpdateBanner);
		await wrapper.find('[data-test="dismiss-btn"]').trigger("click");
		expect(mock.dismiss).toHaveBeenCalledOnce();
	});

	it("emite viewNotes ao clicar em Ver notas", async () => {
		mockComposable({ hasUpdate: ref(true), newVersion: ref("2.0.0") });
		const wrapper = mount(UpdateBanner);
		await wrapper.find('[data-test="notes-btn"]').trigger("click");
		expect(wrapper.emitted("viewNotes")).toBeTruthy();
		expect(wrapper.emitted("viewNotes")![0]).toEqual(["2.0.0"]);
	});
});
