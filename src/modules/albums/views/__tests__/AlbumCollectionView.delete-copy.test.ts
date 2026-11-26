// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

/**
 * RF-03: cópias da Comunidade (custom, ID com offset) expõem exclusão na
 * tela da coletânea, com confirmação. Coletânea oficial não mostra o botão.
 */

const mocks = vi.hoisted(() => ({
	deleteCustomCollection: vi.fn(async () => true),
	appConfirm: vi.fn(async () => true),
	routerPush: vi.fn(),
}));

vi.mock("vue-router", () => ({
	useRoute: () => ({ params: { collectionId: "2000001" } }),
	useRouter: () => ({ push: mocks.routerPush, back: vi.fn() }),
}));
vi.mock("@modules/media/services/custom-catalog", () => ({
	deleteCustomCollection: mocks.deleteCustomCollection,
	isCustomCollectionId: (id: number) => id >= 2_000_000,
	fromCustomCollectionId: (id: number) => id - 2_000_000,
}));
vi.mock("@shared/composables/useAppConfirm", () => ({
	appConfirm: mocks.appConfirm,
}));
vi.mock("vue-i18n", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			key.replace("{name}", String(params?.name ?? "")),
	}),
}));

vi.mock("@design-system/index", () => ({
	MediaCollectionList: { name: "MediaCollectionList", template: "<div />" },
}));
vi.mock("@shared/components/PageBackStack.vue", () => ({
	default: { template: "<div><slot /></div>" },
}));
vi.mock("@shared/composables/useMinimizablePage", () => ({
	useMinimizablePage: () => ({ minimize: vi.fn(), prepare: vi.fn(), takeRestoredState: () => null }),
}));
vi.mock("../../components/AlbumLyricDialog.vue", () => ({ default: { template: "<div />" } }));
vi.mock("../../components/AlbumPlaylistPickerDialog.vue", () => ({ default: { template: "<div />" } }));
vi.mock("../../components/AlbumTrackRow.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@modules/settings/components/StageCustomizationDialog.vue", () => ({
	default: { template: "<div />" },
}));
vi.mock("../../services/playlist-storage", () => ({
	addPlaylistItem: vi.fn(),
	listPlaylists: vi.fn(() => []),
}));

import { ref } from "vue";

vi.mock("../../composables/useAlbums", () => ({
	useAlbums: () => ({
		activeCollection: ref({ id: 2000001, kind: "album", name: "Cópia" }),
		filteredTracks: ref([{ musicId: 1 }]),
		searchQuery: ref(""),
		isLoadingTracks: ref(false),
		lastErrorKey: ref(null),
		lastActionMessageKey: ref(null),
		lyricOpen: ref(false),
		lyricDoc: ref(null),
		isLoadingLyric: ref(false),
		openCollection: vi.fn(async () => true),
		isAlbumDisabled: () => false,
		clearCollection: vi.fn(),
		clearError: vi.fn(),
		clearActionMessage: vi.fn(),
		playSung: vi.fn(),
		playInstrumental: vi.fn(),
		playSlides: vi.fn(),
		playAllInActiveCollection: vi.fn(),
		appendActiveCollectionToQueue: vi.fn(),
		openLyric: vi.fn(),
		closeLyric: vi.fn(),
	}),
}));

import AlbumCollectionView from "../AlbumCollectionView.vue";

describe("AlbumCollectionView — excluir cópia custom (RF-03)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		localStorage.clear();
	});

	it("coletânea custom mostra lixeira; confirmar exclui e volta para a Central", async () => {
		const wrapper = mount(AlbumCollectionView, { global: { plugins: [createPinia()] } });
		await flushPromises();
		const btn = wrapper.find('[data-testid="album-delete-collection"]');
		expect(btn.exists()).toBe(true);
		await btn.trigger("click");
		await flushPromises();
		expect(mocks.appConfirm).toHaveBeenCalled();
		expect(mocks.deleteCustomCollection).toHaveBeenCalledWith(1);
		expect(mocks.routerPush).toHaveBeenCalledWith({ name: "albums" });
	});

	it("cancelar confirmação não exclui nem navega", async () => {
		mocks.appConfirm.mockResolvedValueOnce(false);
		const wrapper = mount(AlbumCollectionView, { global: { plugins: [createPinia()] } });
		await flushPromises();
		await wrapper.find('[data-testid="album-delete-collection"]').trigger("click");
		await flushPromises();
		expect(mocks.deleteCustomCollection).not.toHaveBeenCalled();
		expect(mocks.routerPush).not.toHaveBeenCalled();
	});
});
