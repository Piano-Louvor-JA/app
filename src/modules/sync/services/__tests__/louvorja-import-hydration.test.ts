// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserPreferenceMock, setUserPreferenceMock } = vi.hoisted(() => ({
	getUserPreferenceMock: vi.fn(),
	setUserPreferenceMock: vi.fn(),
}));

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: getUserPreferenceMock,
	setUserPreference: setUserPreferenceMock,
}));

vi.mock("@modules/liturgy/services/liturgy-catalog", () => ({
	loadLiturgyMusicOptions: vi.fn(async () => []),
	loadLiturgyBibleBooks: vi.fn(async () => []),
}));

import { normalizeLiturgyState } from "@modules/liturgy/services/liturgy-preferences";
import { useLiturgyStore } from "@modules/liturgy/stores/useLiturgyStore";
import {
	importLouvorjaIntoBrowser,
	SYNC_MODIFIED_PREFIX,
} from "@modules/sync/services/louvorja-adapter";
import type { LouvorjaSyncPackage } from "@modules/sync/services/louvorja-package";
import { encodeLouvorjaPackage } from "@modules/sync/services/louvorja-package";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import { createPinia, setActivePinia } from "pinia";

const FUTURE = "2099-01-01T00:00:00.000Z";

function saturdayPackage(): LouvorjaSyncPackage {
	return {
		schema: 1,
		appVersion: "test",
		platform: "desktop",
		exportedAt: FUTURE,
		entities: {
			liturgy: {
				type: "liturgy",
				modified: FUTURE,
				data: {
					saturday: {
						items: [
							{
								id: "cat-1",
								type: "category",
								name: "Culto",
								subtitle: "",
								done: false,
								durationMs: 0,
								accentColor: "#FFD600",
								startTime: "10:30",
								endTime: "12:00",
							},
							{
								id: "m-1",
								type: "music",
								name: "Hino",
								subtitle: "",
								done: false,
								durationMs: 0,
								accentColor: "#00E676",
								categoryId: "cat-1",
								musicId: 2000,
								musicMode: "audio",
							},
						],
						notes: "",
					},
				},
			},
		},
	} as unknown as LouvorjaSyncPackage;
}

function seedLocalState() {
	const state = normalizeLiturgyState(null);
	state.weekdays.saturday = [
		{
			id: "old-1",
			type: "annotation",
			name: "Item antigo",
			subtitle: "",
			done: false,
			durationMs: 0,
			accentColor: "#FF6D00",
		},
	];
	return state;
}

describe("import .louvorja hidrata o store de liturgia sem F5 (t_8bdaf97b)", () => {
	let stored: unknown;

	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		setActivePinia(createPinia());
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.liturgy`,
			"2000-01-01T00:00:00.000Z",
		);
		stored = seedLocalState();
		getUserPreferenceMock.mockImplementation((key: string) =>
			key === USER_PREFERENCE_KEYS.liturgyState ? stored : null,
		);
		setUserPreferenceMock.mockImplementation((_key: string, value: unknown) => {
			stored = value;
		});
	});

	it("RED: evento liturgy:imported re-hidrata o store (itens novos visíveis sem F5)", async () => {
		const store = useLiturgyStore();
		await store.hydrate();
		store.selectDay("saturday");
		expect(store.currentItems).toHaveLength(1);
		expect(store.currentItems[0]?.name).toBe("Item antigo");

		const result = importLouvorjaIntoBrowser(saturdayPackage());
		expect(result.applied).toEqual(["liturgy"]);

		window.dispatchEvent(new CustomEvent("liturgy:imported"));
		await vi.waitFor(() => {
			expect(store.weekdays.saturday).toHaveLength(2);
		});
		store.selectDay("saturday");
		expect(store.currentItems).toHaveLength(2);
		expect(store.currentItems[0]?.type).toBe("category");
		expect(store.currentItems[0]?.startTime).toBe("10:30");
		expect(store.currentItems[0]?.endTime).toBe("12:00");
		expect(store.currentItems[1]?.categoryId).toBe("cat-1");
	});

	it("RED: resultado de import LWW-skipped expõe timestamps local e do pacote", () => {
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.liturgy`, FUTURE);
		const result = importLouvorjaIntoBrowser(saturdayPackage());
		expect(result.applied).toEqual([]);
		expect(result.skipped).toContain("liturgy");
		expect(result.localModified).toBe(FUTURE);
		expect(result.packageModified).toBe(FUTURE);
	});

	it("RED: round-trip encode → decode preserva a nova entidade com timestamps", () => {
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.liturgy`,
			"2000-01-01T00:00:00.000Z",
		);
		const pkg = saturdayPackage();
		const decoded = JSON.parse(
			encodeLouvorjaPackage(pkg),
		) as LouvorjaSyncPackage;
		const result = importLouvorjaIntoBrowser(decoded);
		expect(result.applied).toEqual(["liturgy"]);
		expect(result.packageModified).toBe(FUTURE);
		expect(result.localModified).toBe("2000-01-01T00:00:00.000Z");
	});
});
