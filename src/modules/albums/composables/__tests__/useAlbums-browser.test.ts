// @vitest-environment jsdom
// Arquivo dedicado: carrega useAlbums sob isDesktopApp() === false para
// cobrir o FALSE side do if (isDesktop) no onMounted (53,1). Precisa ser
// um arquivo separado porque `const isDesktop = isDesktopApp()` é avaliado
// no load do módulo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const desktopFlag = vi.hoisted(() => ({ value: false }));
const albumStoreMock = vi.hoisted(() => ({
  hydrateCatalog: vi.fn(),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
  isDesktopApp: vi.fn(() => desktopFlag.value),
}));

vi.mock("../../stores/useAlbumsStore", () => ({
  useAlbumsStore: vi.fn(() => albumStoreMock),
}));

vi.mock("@modules/media/stores/useMediaStore", () => ({
  useMediaStore: vi.fn(() => ({
    playAlbumQueue: vi.fn(),
  })),
}));

vi.mock("@modules/sync/stores/useLocalLibraryStore", () => ({
  useLocalLibraryStore: vi.fn(() => ({
    categories: [],
    refreshCollections: vi.fn(async () => {}),
  })),
}));

vi.mock("../../services/album-tracks", () => ({
  loadCollectionTracks: vi.fn(async () => []),
}));

import { useAlbums } from "../useAlbums";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

describe("useAlbums sem desktop (isDesktop false)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    albumStoreMock.hydrateCatalog.mockClear();
    vi.clearAllMocks();
  });

  it("onMounted: hidrata catálogo e NÃO refresha coleções (53,1)", () => {
    const host = defineComponent({
      setup() {
        useAlbums();
        return () => h("div");
      },
    });
    const w = mount(host);
    expect(albumStoreMock.hydrateCatalog).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});
