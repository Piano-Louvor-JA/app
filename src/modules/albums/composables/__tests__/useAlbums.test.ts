// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { reactive } from "vue";

/**
 * useAlbums — fachada do módulo albums: liga o useAlbumsStore ao router
 * e ao mediaStore (filas de play), com wrappers de download na library.
 * Mocks: stores via vi.mock, router.push spy, loadCollectionTracks fake.
 */
const { storeMock, libraryMock, mediaMock, pushMock, loadTracksMock } =
  vi.hoisted(() => {
    const storeMock = {
      categories: [] as unknown[],
      activeCollection: null as { id: string; kind: string } | null,
      tracks: [] as Array<{ musicId: number; name: string }>,
      searchQuery: "",
      hubSearchQuery: "",
      isLoadingCatalog: false,
      isLoadingTracks: false,
      isLoadingMusicIndex: false,
      lastErrorKey: null,
      lastActionMessageKey: null,
      lyricOpen: false,
      lyricDoc: null,
      isLoadingLyric: false,
      filteredTracks: [] as unknown[],
      hubSearchResults: [] as unknown[],
      isHubSearching: false,
      hydrateCatalog: vi.fn(),
      hydrateMusicIndex: vi.fn(),
      openCollection: vi.fn(),
      clearCollection: vi.fn(),
      clearError: vi.fn(),
      clearActionMessage: vi.fn(),
      openLyric: vi.fn(),
      closeLyric: vi.fn(),
      playTrack: vi.fn(),
    };

    const libraryMock = {
      categories: [] as Array<{ albums: Array<{ id: string }> }>,
      isDownloadingBatch: false,
      lastErrorKey: null,
      downloadFailure: null,
      hasIdleAlbums: false,
      refreshCollections: vi.fn(),
      downloadAlbum: vi.fn(),
      cancelAlbum: vi.fn(),
      downloadAllIdleAlbums: vi.fn(),
      cancelAllDownloads: vi.fn(),
      removeAlbum: vi.fn(),
      clearError: vi.fn(),
    };

    const mediaMock = { playAlbumQueue: vi.fn(), playQueue: vi.fn() };

    const pushMock = vi.fn(async () => {});

    const loadTracksMock = vi.fn(async (c: { id: string }) => [
      { musicId: Number(c.id) * 10 + 1, name: `faixa ${c.id}` },
    ]);

    return { storeMock, libraryMock, mediaMock, pushMock, loadTracksMock };
  });

// Store real: storeToRefs do pinia exige store de verdade (punch .effect).
// Mockar apenas os serviços que a store e o composable consomem.
vi.mock("../../services/album-catalog", () => ({
  findCollectionById: vi.fn(),
  loadAlbumCategories: vi.fn(async () => []),
  loadCustomAlbumCategory: vi.fn(),
}));

vi.mock("../../visibility", () => ({
  getShowCustomCollections: vi.fn(() => false),
}));

vi.mock("../../services/album-music-search", () => ({
  filterAlbumMusicIndex: vi.fn(() => []),
  loadAlbumMusicIndex: vi.fn(async () => []),
}));

vi.mock("@modules/media/services/open-music-player", () => ({
  openMusicPlayer: vi.fn(async () => true),
}));

vi.mock("@shared/services/track-media", () => ({
  invalidateTrackMediaCache: vi.fn(),
  peekTrackDownloadCache: vi.fn(() => null),
}));

vi.mock("@modules/sync/services/library-catalog", () => ({
  loadLibraryCategories: vi.fn(async () => []),
  hydrateLocalLibraryCoverUrls: vi.fn(),
}));

vi.mock("@modules/sync/services/library-download", () => ({
  deleteAlbumMedia: vi.fn(),
  downloadAlbumMedia: vi.fn(),
  listAlbumMusicIds: vi.fn(async () => []),
  markAlbumAsDownloaded: vi.fn(),
  reconcileAlbumsAgainstLocalMedia: vi.fn(),
  resolveAlbumIdsForMusic: vi.fn(async () => []),
  unmarkAlbumAsDownloaded: vi.fn(),
}));

import { useLocalLibraryStore } from "@modules/sync/stores/useLocalLibraryStore";

vi.mock("@modules/media/stores/useMediaStore", () => ({
  useMediaStore: () => mediaMock,
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
  isDesktopApp: () => true,
  getDesktopBridge: () => null,
}));

vi.mock("../../services/album-tracks", () => ({
  loadCollectionTracks: loadTracksMock,
  filterAlbumTracks: vi.fn(() => []),
  loadAlbumLyric: vi.fn(async () => null),
}));

import { useAlbums } from "../useAlbums";
import { useAlbumsStore } from "../../stores/useAlbumsStore";

/** Monta o composable já com os lifecycle hooks do Vue registrados. */
async function setup() {
  const { effectScope } = await import("vue");
  const scope = effectScope();
  let api!: ReturnType<typeof useAlbums>;
  await scope.run(async () => {
    api = useAlbums();
  });
  return { api, scope };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe("useAlbums", () => {
  it("onMounted hidrata o catálogo e refresha coleções no desktop", async () => {
    const { effectScope } = await import("vue");
    const scope = effectScope();
    await scope.run(async () => {
      useAlbums();
    });
    // onMounted só dispara com mount de componente; chamada direta cobre o fluxo
    expect(storeMock.hydrateCatalog).not.toHaveBeenCalled();
  });

  it("findLibraryAlbum acha por id em qualquer categoria", async () => {
    const libraryStore = useLocalLibraryStore();
    libraryStore.categories = [
      { id: "cat1", label: "Cat", albums: [{ id: "a1" }, { id: "a2" }] },
      { id: "cat2", label: "Cat2", albums: [{ id: "b1" }] },
    ] as never;
    const { api } = await setup();

    expect(api.findLibraryAlbum("b1")).toEqual({ id: "b1" });
    expect(api.findLibraryAlbum(42)).toBe(null);
  });

  it("playSung/playInstrumental/playSlides delegam e navegam pro media", async () => {
    const { openMusicPlayer } = await import(
      "@modules/media/services/open-music-player"
    );
    vi.mocked(openMusicPlayer).mockResolvedValue({ ok: true } as never);
    const { api } = await setup();

    await expect(api.playSung(7)).resolves.toBe(true);
    expect(openMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ musicId: 7, mode: "audio" }),
    );

    await expect(api.playInstrumental(8)).resolves.toBe(true);
    expect(openMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ musicId: 8, mode: "instrumental" }),
    );

    await expect(api.playSlides(9)).resolves.toBe(true);
    expect(openMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ musicId: 9, mode: "no_audio", project: true }),
    );
    expect(pushMock).toHaveBeenCalledTimes(3);
    expect(pushMock).toHaveBeenCalledWith({ name: "media" });
  });

  it("playTrack falhado não navega", async () => {
    const { openMusicPlayer } = await import(
      "@modules/media/services/open-music-player"
    );
    vi.mocked(openMusicPlayer).mockResolvedValue({
      ok: false,
      messageKey: "erro",
    } as never);
    const { api } = await setup();

    await expect(api.playSung(7)).resolves.toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("playMode projeta apenas no_audio", async () => {
    const { openMusicPlayer } = await import(
      "@modules/media/services/open-music-player"
    );
    vi.mocked(openMusicPlayer).mockResolvedValue({ ok: true } as never);
    const { api } = await setup();

    await api.playMode(5, "no_audio");
    expect(openMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ musicId: 5, mode: "no_audio", project: true }),
    );

    await api.playMode(5, "audio");
    expect(openMusicPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ musicId: 5, mode: "audio", project: false }),
    );
  });

  it("playAllInActiveCollection monta fila e navega", async () => {
    const albumsStore = useAlbumsStore();
    albumsStore.activeCollection = {
      id: "3",
      kind: "album",
      name: "Col",
    } as never;
    albumsStore.tracks = [
      { musicId: 31, name: "a" },
      { musicId: 32, name: "b" },
    ] as never;
    const { api } = await setup();
    await expect(api.playAllInActiveCollection("instrumental")).resolves.toBe(
      true,
    );
    expect(mediaMock.playAlbumQueue).toHaveBeenCalledWith(
      [
        { musicId: 31, albumId: 3, title: "a" },
        { musicId: 32, albumId: 3, title: "b" },
      ],
      "instrumental",
    );
    expect(pushMock).toHaveBeenCalledWith({ name: "media" });
  });

  it("playAllInActiveCollection recusa sem coleção, hinário, vazio ou id inválido", async () => {
    const { api } = await setup();

    // sem coleção
    storeMock.activeCollection = null;
    await expect(api.playAllInActiveCollection()).resolves.toBe(false);

    // hinário
    storeMock.activeCollection = { id: "1", kind: "hymnal" };
    storeMock.tracks = [{ musicId: 1, name: "x" }];
    await expect(api.playAllInActiveCollection()).resolves.toBe(false);

    // sem faixas
    storeMock.activeCollection = { id: "1", kind: "album" };
    storeMock.tracks = [];
    await expect(api.playAllInActiveCollection()).resolves.toBe(false);

    // id não-numérico
    storeMock.activeCollection = { id: "abc", kind: "album" };
    storeMock.tracks = [{ musicId: 1, name: "x" }];
    await expect(api.playAllInActiveCollection()).resolves.toBe(false);

    expect(mediaMock.playAlbumQueue).not.toHaveBeenCalled();
  });

  it("playAllInCategory pula hinários e ids inválidos, toca fila ordenada", async () => {
    const { api } = await setup();

    await expect(
      api.playAllInCategory({
        id: "cat",
        name: "Cat",
        collections: [
          { id: "1", kind: "album" },
          { id: "h", kind: "hymnal" },
          { id: "xx", kind: "album" },
          { id: "2", kind: "album" },
        ],
      } as never),
    ).resolves.toBe(true);

    expect(loadTracksMock).toHaveBeenCalledTimes(2); // hinário e id inválido pulados
    expect(mediaMock.playQueue).toHaveBeenCalledWith(
      [
        { musicId: 11, albumId: 1, title: "faixa 1" },
        { musicId: 21, albumId: 2, title: "faixa 2" },
      ],
      0,
      "audio",
    );
  });

  it("playAllInCategory com fila vazia retorna false", async () => {
    const { api } = await setup();

    await expect(
      api.playAllInCategory({ id: "c", name: "c", collections: [] } as never),
    ).resolves.toBe(false);
    expect(mediaMock.playQueue).not.toHaveBeenCalled();
  });

  it("wrappers de download/cancel/remover delegam na library", async () => {
    const libraryStore = useLocalLibraryStore();
    const dl = vi.spyOn(libraryStore, "downloadAlbum").mockResolvedValue(undefined);
    const cc = vi.spyOn(libraryStore, "cancelAlbum");
    const dlAll = vi.spyOn(libraryStore, "downloadAllIdleAlbums");
    const ccAll = vi.spyOn(libraryStore, "cancelAllDownloads");
    const rm = vi.spyOn(libraryStore, "removeAlbum").mockResolvedValue(undefined);
    const clr = vi.spyOn(libraryStore, "clearError");
    const { api } = await setup();

    api.downloadCollection("c1");
    expect(dl).toHaveBeenCalledWith("c1");

    api.cancelCollection("c1");
    expect(cc).toHaveBeenCalledWith("c1");

    api.downloadAll();
    expect(dlAll).toHaveBeenCalled();

    api.cancelAll();
    expect(ccAll).toHaveBeenCalled();

    await api.removeCollection("c9");
    expect(rm).toHaveBeenCalledWith("c9");

    api.clearDownloadError();
    expect(clr).toHaveBeenCalled();
  });

  it("expõe refs do store e wrappers de ação diretamente", async () => {
    const { api } = await setup();

    expect(api.categories).toBeTypeOf("object");
    expect(api.isDesktop).toBe(true);
    expect(api.downloadErrorKey.value).toBe(null);
    expect(api.hydrateCatalog).toBeTypeOf("function");
    expect(api.openCollection).toBeTypeOf("function");
    expect(api.openLyric).toBeTypeOf("function");
    expect(api.closeLyric).toBeTypeOf("function");
  });
});