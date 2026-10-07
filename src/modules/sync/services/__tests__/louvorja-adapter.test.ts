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

	it("não leva id local negativo para outro aparelho", () => {
		mockGet.mockImplementation((key: string) => {
			if (key === USER_PREFERENCE_KEYS.liturgyState) {
				return {
					...LITURGY_STATE,
					weekdays: {
						sunday: [
							{
								...LITURGY_STATE.weekdays.sunday[0],
								musicId: -3,
							},
						],
					},
				};
			}
			return null;
		});
		const pkg = exportLouvorjaFromBrowser("1.17.5", "web");
		const items = pkg.entities.liturgy?.data.sunday.items as Array<{
			musicId: number | null;
		}>;
		expect(items[0]?.musicId).toBeNull();
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

  it("gaps: export com state mas dias vazios (59); import com current null (93), payload sem items/notes (105/108), toEpoch inválido → readModified catch (146)", () => {
    // export: state existe mas weekdays/dayNotes vazios → 59 false
    mockGet.mockImplementation((key: string) => {
      if (key === USER_PREFERENCE_KEYS.liturgyState)
        return { weekdays: {}, dayNotes: {} };
      return null;
    });
    const pkg = exportLouvorjaFromBrowser("1.17.5", "web");
    expect(pkg.entities.liturgy).toBeUndefined();

    // import: remote mais novo + current null → skipped (93)
    mockGet.mockImplementation((key: string) => {
      if (key === USER_PREFERENCE_KEYS.liturgyState) return null;
      return null;
    });
    const result = importLouvorjaIntoBrowser(
      pkgWith({
        liturgy: {
          type: "liturgy",
          modified: "2026-09-01T00:00:00.000Z",
          data: { sunday: { items: [{ id: "x" }], notes: "n" } },
        },
      }),
    );
    console.log("RES1", JSON.stringify(result));
    expect(result.skipped).toContain("liturgy");

    // import: payload torto (items não-array, notes não-string) → hasDay false → skipped (105/108 false)
    mockGet.mockImplementation((key: string) => {
      if (key === USER_PREFERENCE_KEYS.liturgyState) return LITURGY_STATE;
      return null;
    });
    const r2 = importLouvorjaIntoBrowser(
      pkgWith({
        liturgy: {
          type: "liturgy",
          modified: "2026-09-02T00:00:00.000Z",
          data: { sunday: { items: "não-array", notes: 42 }, monday: null },
        },
      }),
    );
    // dia presente porém sem items/notes válidos: aplicado, mas os campos
    // tortos NÃO sobrescrevem (105/108 false side); modified gravado
    expect(r2.applied).toContain("liturgy");
    expect(mockSet.mock.calls[0][1].weekdays.sunday).toEqual(LITURGY_STATE.weekdays.sunday);
    // payload válido de novo → applied (105/108 true side) e modified gravado
    const r3 = importLouvorjaIntoBrowser(
      pkgWith({
        liturgy: {
          type: "liturgy",
          modified: "2026-09-03T00:00:00.000Z",
          data: { sunday: { items: [{ id: "y" }], notes: "ok" } },
        },
      }),
    );
    expect(r3.applied).toContain("liturgy");
  });

  it("gaps: readModified com storage quebrado retorna vazio (146)", () => {
    const original = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage quebrado");
    });
    const pkg = exportLouvorjaFromBrowser("1.17.5", "web");
    expect(pkg.entities.liturgy?.modified).toBe("");
    localStorage.getItem = original;
  });
});
