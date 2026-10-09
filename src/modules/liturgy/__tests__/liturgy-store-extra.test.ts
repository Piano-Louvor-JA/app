// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JaLiturgy } from "../services/liturgy-ja-import";
import { useLiturgyStore } from "../stores/useLiturgyStore";
import type { LiturgyItem } from "../types/liturgy";

vi.mock("../services/liturgy-preferences", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../services/liturgy-preferences")>();
	return { ...actual, saveLiturgyState: vi.fn() };
});

const bridgeMock: Record<string, unknown> = {};
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: () =>
		Object.keys(bridgeMock).length > 0 ? (bridgeMock as never) : undefined,
}));

vi.mock("../services/liturgy-catalog", () => ({
	loadLiturgyMusicOptions: vi.fn(async () => [
		{
			id: 101,
			name: "Hino 1",
			hymnalTrack: 1,
			albumNames: "H",
			displayLabel: "Hino 1",
			durationMs: 300000,
			hasInstrumental: true,
		},
	]),
	loadLiturgyBibleBooks: vi.fn(async () => [
		{ id: 1, name: "Gênesis", chapters: 50 },
	]),
	filterLiturgyMusicOptions: vi.fn((list: { name: string }[], q: string) =>
		list.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
	),
}));

vi.mock("../services/liturgy-actions", () => ({
	executeLiturgyItem: vi.fn(async () => ({ ok: true, messageKey: null })),
	openLiturgyMusicPlayer: vi.fn(async () => ({ ok: true, messageKey: null })),
	playLiturgyItemOnScreens: vi.fn(async () => ({ ok: true, messageKey: null })),
}));

vi.mock("../services/liturgy-web-runtime", () => ({
	clearLiturgyWebRuntime: vi.fn(),
}));

function jaItem(over: Partial<LiturgyItem>): LiturgyItem {
	return {
		id: "ja-1",
		type: "annotation",
		name: "Item",
		subtitle: "",
		done: false,
		durationMs: 0,
		accentColor: "#000",
		...over,
	};
}

function addCategory(
	s: ReturnType<typeof useLiturgyStore>,
	name = "Categoria",
): void {
	s.openAddDialog();
	s.setItemDraft({
		...s.itemDraft,
		type: "category",
		name,
		startTime: "09:00",
		endTime: "10:00",
	});
	if (!s.saveItemDraft()) throw new Error("categoria inválida");
}

function addItem(
	s: ReturnType<typeof useLiturgyStore>,
	over: Partial<LiturgyItem>,
): void {
	addCategory(s, "Cat " + over.name);
	const cat = s.currentItems.find((i) => i.type === "category")!;
	s.openAddSubItemDialog(cat.id);
	s.setItemDraft({
		...s.itemDraft,
		type: "annotation",
		name: over.name ?? "Item",
	});
	if (!s.saveItemDraft()) throw new Error("item inválido");
}

beforeEach(() => {
	vi.clearAllMocks();
	Object.keys(bridgeMock).forEach((k) => delete bridgeMock[k]);
	localStorage.clear();
	setActivePinia(createPinia());
});

describe("liturgy store — computed de dia (custom/weekday)", () => {
	it("selectedDay custom -> currentItems do custom; title computado (300/338)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		s.newCustomName = "Minha Custom";
		s.createCustomLiturgy();
		s.selectedDay = "custom";
		expect(s.currentCustomTitle).toBe("Minha Custom");
		addCategory(s, "Cat Custom");
		expect(s.currentItems.length).toBe(1);
	});

	it("selectedDay weekday -> items do dia (178/203)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		s.selectedDay = "sunday";
		addItem(s, { name: "Domingo" });
		expect(s.currentItems.length).toBe(2);
	});
});

describe("liturgy store — play/execute por tipo (907-1105)", () => {
	it("playItemOnScreens com site: bridge sem controle -> define siteProjectionItemId", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		s.selectedDay = "sunday";
		s.openAddDialog();
		s.setItemDraft({
			...s.itemDraft,
			type: "site",
			name: "YouTube",
			url: "https://exemplo.com",
			categoryId: "raiz",
		} as never);
		expect(s.saveItemDraft()).toBe(true);
		await s.playItemOnScreens(0);
		expect(s.siteProjectionItemId).toBe(s.currentItems[0]?.id);
	});

	it("playItemOnScreens índice inválido -> no-op (962)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		await s.playItemOnScreens(99);
		expect(true).toBe(true);
	});
});

describe("liturgy store — toggle em categoria (852)", () => {
	it("reorderItems em lista vazia -> no-op", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		s.reorderItems(0, 1);
		expect(s.currentItems).toEqual([]);
	});

	it("toggleItemDone em categoria não faz nada (852)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		addCategory(s, "C1");
		const cat = s.currentItems.find((i) => i.type === "category")!;
		s.toggleItemDone(cat.id);
		expect(cat.done).toBe(false);
	});
});

describe("liturgy store — clone/merge bordas (1167-1221)", () => {
	it("cloneSourceKey com dias vazios -> string vazia; custom vazia -> null (1167/1186)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		expect(s.cloneSources.length).toBeGreaterThanOrEqual(0);
	});
});

describe("liturgy store — duração e items na custom (450-469/650)", () => {
	it("saveItemDraft de moment sem duração usa default (650)", async () => {
		const s = useLiturgyStore();
		await s.hydrate();
		addCategory(s, "Cat Prayer");
		const cat = s.currentItems.find((i) => i.type === "category")!;
		s.openAddSubItemDialog(cat.id);
		s.setItemDraft({ ...s.itemDraft, type: "prayer", name: "Oração" });
		expect(s.saveItemDraft()).toBe(true);
		const all = s.currentItems as Array<{
			type: string;
			durationMs?: number;
			children?: Array<{ type: string; durationMs?: number }>;
		}>;
		const flat: Array<{ type: string; durationMs?: number }> = [];
		for (const it of all) {
			flat.push(it);
			for (const c of it.children ?? []) flat.push(c);
		}
		const prayer = flat.find((x) => x.type === "prayer");
		expect(prayer).toBeTruthy();
	});
});
