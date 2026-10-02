// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import UpdateDialog from "../UpdateDialog.vue";

// Mock do composable
vi.mock("../../composables/useUpdateChecker", () => ({
	useUpdateChecker: vi.fn(),
}));

import { useUpdateChecker } from "../../composables/useUpdateChecker";

function mockComposable(
	overrides: Partial<ReturnType<typeof useUpdateChecker>> = {},
) {
	const defaults = {
		newVersion: ref<string | null>(null),
		releaseNotes: ref<string | null>(null),
		isDownloading: ref(false),
		isDownloaded: ref(false),
		downloadProgress: ref(0),
		error: ref<string | null>(null),
		downloadUpdate: vi.fn(),
		installUpdate: vi.fn(),
	};
	const merged = { ...defaults, ...overrides };
	vi.mocked(useUpdateChecker).mockReturnValue(merged as any);
	return merged;
}

// Teleport é stubado para renderizar o conteúdo inline no wrapper
function mountDialog(modelValue = true) {
	return mount(UpdateDialog, {
		props: { modelValue },
		global: { stubs: { teleport: true } },
	});
}

describe("UpdateDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("não renderiza quando model=false", () => {
		mockComposable();
		const wrapper = mountDialog(false);
		expect(wrapper.find('[data-test="update-dialog"]').exists()).toBe(false);
	});

	it("sanitiza HTML malicioso: script e img onerror removidos, texto preservado", () => {
		mockComposable({
			newVersion: ref("2.0.0"),
			releaseNotes: ref(
				'<h2>Novidades</h2><script>alert("xss")</script><p>Correções de bugs</p><img src=x onerror="alert(1)">',
			),
		});
		const wrapper = mountDialog();
		expect(wrapper.find('[data-test="update-dialog"]').exists()).toBe(true);

		const notes = wrapper.find('[data-test="release-notes"]');
		expect(notes.exists()).toBe(true);
		expect(notes.html()).not.toContain("<script");
		expect(notes.html()).not.toContain("onerror");
		expect(notes.html()).not.toContain("alert");
		// Texto legítimo é preservado
		expect(notes.text()).toContain("Novidades");
		expect(notes.text()).toContain("Correções de bugs");
	});

	it("renderiza release notes legítimas (markdown) formatadas", () => {
		mockComposable({
			newVersion: ref("2.0.0"),
			releaseNotes: ref(
				"<h2>Mudanças</h2><ul><li>Correção do áudio</li><li>Novo hino</li></ul>",
			),
		});
		const wrapper = mountDialog();
		const notes = wrapper.find('[data-test="release-notes"]');
		expect(notes.find("h2").exists()).toBe(true);
		expect(notes.find("h2").text()).toBe("Mudanças");
		expect(notes.findAll("li").length).toBe(2);
		expect(notes.text()).toContain("Correção do áudio");
	});

	it("mostra mensagem vazia quando não há release notes", () => {
		mockComposable({ newVersion: ref("2.0.0"), releaseNotes: ref(null) });
		const wrapper = mountDialog();
		expect(wrapper.find('[data-test="release-notes"]').exists()).toBe(false);
		expect(wrapper.text()).toContain("Sem notas de versão.");
	});
});
