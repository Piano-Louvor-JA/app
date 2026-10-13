// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLiturgyStore } from "../stores/useLiturgyStore";
import type { LiturgyItem } from "../types/liturgy";

vi.mock("../services/liturgy-preferences", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../services/liturgy-preferences")>();
	return { ...actual, saveLiturgyState: vi.fn() };
});

const executeLiturgyItem = vi.fn(async () => ({ ok: true, messageKey: null }));
const playLiturgyItemOnScreens = vi.fn(async () => ({ ok: true, messageKey: null }));
vi.mock("../services/liturgy-actions", () => ({
	executeLiturgyItem: (...a: unknown[]) => executeLiturgyItem(...(a as [])),
	openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true, messageKey: null })),
	playLiturgyItemOnScreens: (...a: unknown[]) =>
		playLiturgyItemOnScreens(...(a as [])),
}));

vi.mock("../services/liturgy-catalog", () => ({
	loadLiturgyMusicOptions: vi.fn(async () => []),
	loadLiturgyBibleBooks: vi.fn(async () => []),
	filterLiturgyMusicOptions: vi.fn((list: unknown[]) => list),
}));

vi.mock("../services/liturgy-web-runtime", () => ({
	clearLiturgyWebRuntime: vi.fn(),
}));

function item(over: Partial<LiturgyItem>): LiturgyItem {
	return {
		id: `it-${Math.random().toString(36).slice(2, 7)}`,
		type: "annotation",
		name: "Item",
		subtitle: "",
		done: false,
		durationMs: 0,
		accentColor: "#000",
		...over,
	};
}

function seedItems(s: ReturnType<typeof useLiturgyStore>, items: LiturgyItem[]) {
	// hidrata direto pelo draft interno: usa openAddDialog + setItemDraft por item
	// (API pública do store). Para simplificar, injeta via addFromDialog em lote.
	s.openAddDialog();
	// monta via importação de itens em memória:
	(s as unknown as { currentItems: LiturgyItem[] }).currentItems = items;
}

beforeEach(() => {
	setActivePinia(createPinia());
	vi.clearAllMocks();
});

describe("markItemDone / toggleItemDone — categorias e seleção", () => {
	it("toggleItemDone: item de mídia marca direto", () => {
		const s = useLiturgyStore();
		const cat = item({ id: "cat-1", type: "category", name: "Bloco" });
		const music = item({ id: "m-1", type: "music", categoryId: "cat-1" });
		seedItems(s, [cat, music]);
		s.toggleItemDone(1, true);
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored.find((i) => i.id === "m-1")?.done).toBe(true);
	});

	it("toggleItemDone em item de categoria propaga pros filhos", () => {
		const s = useLiturgyStore();
		const cat = item({ id: "cat-1", type: "category", name: "Bloco" });
		const child = item({ id: "c-1", type: "music", categoryId: "cat-1" });
		seedItems(s, [cat, child]);
		s.toggleItemDone(0, true);
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored.find((i) => i.id === "cat-1")?.done).toBe(true);
		expect(stored.find((i) => i.id === "c-1")?.done).toBe(true);
	});

	it("toggleItemDone: índice inválido não lança", () => {
		const s = useLiturgyStore();
		seedItems(s, [item({})]);
		expect(() => s.toggleItemDone(99, true)).not.toThrow();
	});

	it("toggleItemDone: categoria com filhos todos done vira done", () => {
		const s = useLiturgyStore();
		const cat = item({ id: "cat-1", type: "category", name: "Bloco" });
		const c1 = item({ id: "c-1", type: "music", categoryId: "cat-1" });
		seedItems(s, [cat, c1]);
		s.toggleItemDone(0, true);
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored.find((i) => i.id === "cat-1")?.done).toBe(true);
	});
});

describe("playItemOnScreens — markItemDone interno via execute", () => {
	it("playItemOnScreens em music: playLiturgyItemOnScreens chamado e marca done", async () => {
		const s = useLiturgyStore();
		seedItems(s, [item({ type: "music", name: "Hino 1" })]);
		await s.playItemOnScreens(0);
		expect(playLiturgyItemOnScreens).toHaveBeenCalled();
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored[0].done).toBe(true);
	});

	it("playItemOnScreens falho: não marca done", async () => {
		playLiturgyItemOnScreens.mockResolvedValueOnce({ ok: false, messageKey: "liturgy.err" });
		const s = useLiturgyStore();
		seedItems(s, [item({ type: "annotation" })]);
		await s.playItemOnScreens(0);
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored[0].done).toBe(false);
	});

	it("playItemOnScreens site: seta siteProjectionItemId", async () => {
		const s = useLiturgyStore();
		seedItems(s, [item({ type: "site", name: "Site" })]);
		await s.playItemOnScreens(0);
		const state = (s as unknown as { $state: Record<string, unknown> }).$state ?? (s as unknown as Record<string, unknown>);
		expect(state.siteProjectionItemId ?? (s.$ as unknown as Record<string, unknown>).siteProjectionItemId).toBeTruthy();
	});

	it("playItemOnScreens vídeo: seta videoProjectionItemId", async () => {
		const s = useLiturgyStore();
		seedItems(s, [item({ type: "video", name: "Vídeo" })]);
		await s.playItemOnScreens(0);
		const state2 = (s as unknown as { $state: Record<string, unknown> }).$state ?? (s as unknown as Record<string, unknown>);
		expect(state2.videoProjectionItemId ?? (s.$ as unknown as Record<string, unknown>).videoProjectionItemId).toBeTruthy();
	});

	it("playItemOnScreens site: não marca done (não é media play type)", async () => {
		const s = useLiturgyStore();
		seedItems(s, [item({ type: "site", name: "Site" })]);
		await s.playItemOnScreens(0);
		const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
		expect(stored[0].done).toBe(false);
	});
describe("liturgy — edit/remove/probe/execução (gaps round 2)", () => {
  it("openEditDialog: executa sem erro pra category e música", () => {
    const s = useLiturgyStore();
    const a = item({ id: "a-1", type: "music", name: "A" });
    const cat = item({ id: "cat-9", type: "category", name: "Bloco" });
    (s as unknown as { currentItems: LiturgyItem[] }).currentItems = [a, cat];
    expect(() => s.openEditDialog?.(1)).not.toThrow();
    expect(() => s.openEditDialog?.(0)).not.toThrow();
  });

  it("removeItem com deletionLocked: ignora", () => {
    const s = useLiturgyStore();
    (s as unknown as { currentItems: LiturgyItem[] }).currentItems = [item({ id: "x" })];
    s.toggleDeletionLock?.();
    const before = (s as unknown as { currentItems: LiturgyItem[] }).currentItems.length;
    s.removeItem?.(0);
    const after = (s as unknown as { currentItems: LiturgyItem[] }).currentItems.length;
    expect([before, after]).toEqual([before, before]);
  });

  it("removeItem: categoria com filhos remove tudo", () => {
    const s = useLiturgyStore();
    const cat = item({ id: "cat", type: "category", name: "Bloco" });
    const c1 = item({ id: "c1", type: "music", categoryId: "cat" });
    (s as unknown as { currentItems: LiturgyItem[] }).currentItems = [cat, c1];
    s.removeItem?.(0);
    const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
    expect(stored.find((i) => i.id === "cat")).toBeUndefined();
    expect(stored.find((i) => i.id === "c1")).toBeUndefined();
  });

  it("toggleItemDone em filho: pai done = allDone(children)", () => {
    const s = useLiturgyStore();
    const cat = item({ id: "cat", type: "category", name: "Bloco" });
    const c1 = item({ id: "c1", type: "music", categoryId: "cat" });
    const c2 = item({ id: "c2", type: "music", categoryId: "cat" });
    (s as unknown as { currentItems: LiturgyItem[] }).currentItems = [cat, c1, c2];
    s.toggleItemDone(1, true);
    s.toggleItemDone(2, true);
    const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
    expect(stored.find((i) => i.id === "cat")?.done).toBe(true);
  });

  it("toggleItemDone uncheck: pai desmarca com filho pendente", () => {
    const s = useLiturgyStore();
    const cat = item({ id: "cat", type: "category", name: "Bloco", done: true });
    const c1 = item({ id: "c1", type: "music", categoryId: "cat", done: true });
    (s as unknown as { currentItems: LiturgyItem[] }).currentItems = [cat, c1];
    s.toggleItemDone(1, false);
    const stored = (s as unknown as { currentItems: LiturgyItem[] }).currentItems;
    expect(stored.find((i) => i.id === "cat")?.done).toBe(false);
  });
});

});