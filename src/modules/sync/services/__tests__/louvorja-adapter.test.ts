// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	exportLouvorjaFromBrowser,
	importLouvorjaIntoBrowser,
	SYNC_MODIFIED_PREFIX,
} from "../louvorja-adapter";
import {
	encodeLouvorjaPackage,
	type LouvorjaSyncPackage,
} from "../louvorja-package";

// user-preferences é a única dependência externa do adaptador (localStorage)
vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: vi.fn(),
	setUserPreference: vi.fn(),
}));

import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
	getUserPreference,
	setUserPreference,
} from "@shared/services/user-preferences";

const mockGet = vi.mocked(getUserPreference);
const mockSet = vi.mocked(setUserPreference);

const LITURGY_STATE = {
	weekdays: {
		sunday: [
			{
				id: "a1",
				type: "music",
				name: "Louvo ao Senhor",
				durationMs: 0,
				musicId: 15,
				musicMode: "audio",
			},
		],
	},
	dayNotes: { sunday: "Chegar 30min antes" },
};

function pkgWith(
	entities: LouvorjaSyncPackage["entities"],
): LouvorjaSyncPackage {
	return {
		schema: 1,
		appVersion: "0.1.18",
		platform: "apk",
		exportedAt: "2026-08-16T00:00:00.000Z",
		entities,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
});

describe("exportLouvorjaFromBrowser", () => {
	it("inclui liturgy quando há estado salvo", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === USER_PREFERENCE_KEYS.liturgyState) return LITURGY_STATE;
			return null;
		});

		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");

		expect(pkg.schema).toBe(1);
		expect(pkg.entities.liturgy?.data).toEqual({
			sunday: {
				items: LITURGY_STATE.weekdays.sunday,
				notes: LITURGY_STATE.dayNotes.sunday,
			},
		});
	});

	it("inclui agendados com categorias e conteúdo no pacote", () => {
		const scheduled = {
			categories: [{ id: "momento", name: "Momentos de Louvor" }],
			items: [{
				id: "m-2026-10-10", categoryId: "momento", date: "2026-10-10",
				name: "Hino 15", filePath: "", isRelativePath: false, notes: "",
				content: { kind: "music", musicId: 15, musicMode: "audio" },
			}],
		};
		mockGet.mockImplementation((key: string) =>
			key === USER_PREFERENCE_KEYS.scheduledState ? scheduled : null,
		);

		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");

		expect(pkg.entities.scheduled).toMatchObject({
			type: "scheduled", data: scheduled,
		});
	});

	it("não inclui liturgy quando estado vazio", () => {
		mockGet.mockReturnValue(null);

		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");

		expect(pkg.entities.liturgy).toBeUndefined();
	});

	it("usa timestamp LWW salvo quando existe", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === USER_PREFERENCE_KEYS.liturgyState) return LITURGY_STATE;
			return null;
		});
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.liturgy`,
			"2026-08-14T00:00:00.000Z",
		);

		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");

		expect(pkg.entities.liturgy?.modified).toBe("2026-08-14T00:00:00.000Z");
	});

	it("usa epoch quando não há timestamp LWW", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === USER_PREFERENCE_KEYS.liturgyState) return LITURGY_STATE;
			return null;
		});

		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");

		expect(pkg.entities.liturgy?.modified).toBe("");
	});
});

describe("importLouvorjaIntoBrowser", () => {
	it("aplica liturgia remota mais nova", () => {
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.liturgy`,
			"2026-08-10T00:00:00.000Z",
		);

		const result = importLouvorjaIntoBrowser(
			pkgWith({
				liturgy: {
					type: "liturgy",
					modified: "2026-08-16T00:00:00.000Z",
					data: {
						sunday: {
							items: LITURGY_STATE.weekdays.sunday,
							notes: LITURGY_STATE.dayNotes.sunday,
						},
					},
				},
			}),
		);

		expect(result.applied).toContain("liturgy");
		expect(mockSet).toHaveBeenCalledWith(
			USER_PREFERENCE_KEYS.liturgyState,
			LITURGY_STATE,
		);
		expect(localStorage.getItem(`${SYNC_MODIFIED_PREFIX}.liturgy`)).toBe(
			"2026-08-16T00:00:00.000Z",
		);
	});

	it("importa agendados novos e descarta item com categoria ausente", () => {
		const result = importLouvorjaIntoBrowser(pkgWith({
			scheduled: {
				type: "scheduled", modified: "2026-10-16T00:00:00.000Z",
				data: {
					categories: [{ id: "esab", name: "Escola Sabatina" }],
					items: [
						{ id: "ok", categoryId: "esab", date: "2026-10-10", name: "Inicial", filePath: "", isRelativePath: false, notes: "" },
						{ id: "orphan", categoryId: "sumida", date: "2026-10-10", name: "Ignorar", filePath: "", isRelativePath: false, notes: "" },
					],
				},
			},
		}));

		expect(result.applied).toContain("scheduled");
		expect(mockSet).toHaveBeenCalledWith(USER_PREFERENCE_KEYS.scheduledState, {
			categories: [{ id: "esab", name: "Escola Sabatina" }],
			items: [{ id: "ok", categoryId: "esab", date: "2026-10-10", name: "Inicial", filePath: "", isRelativePath: false, notes: "" }],
		});
		expect(localStorage.getItem(`${SYNC_MODIFIED_PREFIX}.scheduled`)).toBe("2026-10-16T00:00:00.000Z");
	});

	it("importação agendada ignora conteúdo de tipo desconhecido", () => {
		const result = importLouvorjaIntoBrowser(pkgWith({
			scheduled: {
				type: "scheduled", modified: "2026-10-16T00:00:00.000Z",
				data: {
					categories: [{ id: "momento", name: "Momentos" }],
					items: [{ id: "bad", categoryId: "momento", date: "2026-10-10", name: "Inválido", filePath: "", isRelativePath: false, notes: "", content: { kind: "shell" } }],
				},
			},
		}));

		expect(result.applied).toContain("scheduled");
		expect(mockSet).toHaveBeenCalledWith(USER_PREFERENCE_KEYS.scheduledState, {
			categories: [{ id: "momento", name: "Momentos" }], items: [],
		});
	});

	it("pula agendados remotos mais velhos (LWW)", () => {
		localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.scheduled`, "2026-10-17T00:00:00.000Z");
		const result = importLouvorjaIntoBrowser(pkgWith({
			scheduled: { type: "scheduled", modified: "2026-10-16T00:00:00.000Z", data: { categories: [], items: [] } },
		}));
		expect(result.skipped).toContain("scheduled");
		expect(mockSet).not.toHaveBeenCalled();
	});

	it("pula liturgia remota mais velha (LWW)", () => {
		localStorage.setItem(
			`${SYNC_MODIFIED_PREFIX}.liturgy`,
			"2026-08-17T00:00:00.000Z",
		);

		const result = importLouvorjaIntoBrowser(
			pkgWith({
				liturgy: {
					type: "liturgy",
					modified: "2026-08-16T00:00:00.000Z",
					data: {
						sunday: {
							items: LITURGY_STATE.weekdays.sunday,
							notes: LITURGY_STATE.dayNotes.sunday,
						},
					},
				},
			}),
		);

		expect(result.skipped).toContain("liturgy");
		expect(mockSet).not.toHaveBeenCalled();
	});

	it("ignora entidade desconhecida (forward-compat)", () => {
		const result = importLouvorjaIntoBrowser(
			pkgWith({
				favorites: {
					type: "favorites",
					modified: "2026-08-16T00:00:00.000Z",
					data: { ids: [1, 2] },
				},
			}),
		);

		expect(result.applied).toEqual([]);
		expect(result.skipped).toEqual([]);
	});

	it("pula liturgia sem state no payload", () => {
		const result = importLouvorjaIntoBrowser(
			pkgWith({
				liturgy: {
					type: "liturgy",
					modified: "2026-08-16T00:00:00.000Z",
					data: {},
				},
			}),
		);

		expect(result.skipped).toContain("liturgy");
	});
});

describe("roundtrip com codec", () => {
	it("export → encode → decode → import aplica", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === USER_PREFERENCE_KEYS.liturgyState) return LITURGY_STATE;
			if (key === `${SYNC_MODIFIED_PREFIX}.liturgy`)
				return "2026-08-01T00:00:00.000Z";
			return null;
		});

		const exported = exportLouvorjaFromBrowser("1.17.5", "web");
		const raw = encodeLouvorjaPackage(exported);
		const decoded = JSON.parse(raw);

		expect(decoded.entities.liturgy.data.sunday.items[0].name).toBe(
			"Louvo ao Senhor",
		);
	});
});
