// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento louvorja-adapter — ramos: liturgy sem estado local (skip),
 * readModified sem storage (""), entidade não suportada.
 */
import {
	exportLouvorjaFromBrowser,
	importLouvorjaIntoBrowser,
} from "../louvorja-adapter";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";

beforeEach(() => {
	localStorage.clear();
});

describe("applySyncPackage — liturgy sem estado local", () => {
	it("remote mais novo + current null -> skipped liturgy (93-95)", () => {
		const result = importLouvorjaIntoBrowser({
			entities: {
				liturgy: {
					modified: "2030-01-01T00:00:00Z",
					data: {
						sunday: {
							items: [{ id: "1" }],
							notes: "nota",
						},
					},
				},
			},
		} as never);
		expect(result.skipped).toContain("liturgy");
		expect(result.applied).not.toContain("liturgy");
	});

	it("entidade desconhecida -> ignorada (forward-compatible)", () => {
		const result = importLouvorjaIntoBrowser({
			entities: {
				desconhecida: { modified: "2030-01-01T00:00:00Z", data: {} },
			},
		} as never);
		expect(result.applied).toEqual([]);
		expect(result.skipped).toEqual([]);
	});

	it("remote sem modified válido (epoch 0) não sobrepõe local vazio (146 via toEpoch)", () => {
		const result = importLouvorjaIntoBrowser({
			entities: {
				liturgy: {
					modified: "data-inválida",
					data: { sunday: { items: [] } },
				},
			},
		} as never);
		// local "" -> epoch 0; remote 0 > 0 false -> skipped
		expect(result.skipped).toContain("liturgy");
	});
});

describe("exportLouvorjaFromBrowser — sem estado local", () => {
	it("entidades vazias quando não há liturgy salva", () => {
		const pkg = exportLouvorjaFromBrowser("1.0", "test");
		expect(Object.keys(pkg.entities)).toHaveLength(0);
	});
});

describe("louvorja-adapter — ramos residuais", () => {
	function setState(state: unknown): void {
		localStorage.setItem(
			"user_data",
			JSON.stringify({ [USER_PREFERENCE_KEYS.liturgyState]: state }),
		);
	}

	it("export: weekdays/dayNotes ausentes (optional chain) -> entidades vazias (55-56 ??)", () => {
		setState({ customLiturgies: [] });
		const pkg = exportLouvorjaFromBrowser("1.0", "test");
		expect(Object.keys(pkg.entities)).toHaveLength(0);
	});

	it("export: dia só com items (notes vazias) e dia só com notes (ramos do ||, 57)", () => {
		setState({
			weekdays: { monday: [{ id: "i1" }], tuesday: [] },
			dayNotes: { tuesday: "nota terça" },
		});
		const pkg = exportLouvorjaFromBrowser("1.0", "test");
		expect(pkg.entities.liturgy?.data).toEqual({
			monday: { items: [{ id: "i1" }], notes: "" },
			tuesday: { items: [], notes: "nota terça" },
		});
	});

	it("import: payload do dia não é objeto -> continue sem aplicar (103)", () => {
		setState({
			weekdays: { sunday: [] },
			dayNotes: { sunday: "" },
		});
		localStorage.setItem(
			"sync.modified.v1.liturgy",
			"2026-08-10T00:00:00.000Z",
		);
		const result = importLouvorjaIntoBrowser({
			entities: {
				liturgy: {
					type: "liturgy",
					modified: "2030-01-01T00:00:00Z",
					data: { sunday: "não-objeto", monday: null },
				},
			},
		} as never);
		expect(result.skipped).toContain("liturgy");
		expect(result.applied).toEqual([]);
	});

	it("import: payload objeto sem items nem notes válidos -> hasDay true sem merge de campos (105/108 falsos)", () => {
		setState({
			weekdays: { sunday: [{ id: "old" }] },
			dayNotes: { sunday: "antiga" },
		});
		localStorage.setItem(
			"sync.modified.v1.liturgy",
			"2026-08-10T00:00:00.000Z",
		);
		const result = importLouvorjaIntoBrowser({
			entities: {
				liturgy: {
					type: "liturgy",
					modified: "2030-01-01T00:00:00Z",
					data: { sunday: { items: "não-array", notes: 42 } },
				},
			},
		} as never);
		expect(result.applied).toContain("liturgy");
		const saved = JSON.parse(
			localStorage.getItem("user_data") ?? "{}",
		)[USER_PREFERENCE_KEYS.liturgyState];
		expect(saved.weekdays.sunday).toEqual([{ id: "old" }]);
		expect(saved.dayNotes.sunday).toBe("antiga");
		expect(localStorage.getItem("sync.modified.v1.liturgy")).toBe(
			"2030-01-01T00:00:00Z",
		);
	});

	it("import: só notes (sem items) aplica notas e marca aplicado (105 falso / 108 verdadeiro)", () => {
		setState({ weekdays: {}, dayNotes: {} });
		localStorage.setItem(
			"sync.modified.v1.liturgy",
			"2026-08-10T00:00:00.000Z",
		);
		const result = importLouvorjaIntoBrowser({
			entities: {
				liturgy: {
					type: "liturgy",
					modified: "2030-01-01T00:00:00Z",
					data: { wednesday: { notes: "ensaio 19h" } },
				},
			},
		} as never);
		expect(result.applied).toContain("liturgy");
		const saved = JSON.parse(
			localStorage.getItem("user_data") ?? "{}",
		)[USER_PREFERENCE_KEYS.liturgyState];
		expect(saved.dayNotes.wednesday).toBe("ensaio 19h");
	});

	it("readModified: localStorage.getItem lançando -> \"\" (catch, 145-146)", () => {
		setState({ weekdays: { sunday: [{ id: "x" }] }, dayNotes: {} });
		const original = localStorage.getItem.bind(localStorage);
		const spy = vi
			.spyOn(localStorage, "getItem")
			.mockImplementation((key: string) => {
				if (key === "sync.modified.v1.liturgy") {
					throw new Error("storage bloqueado");
				}
				return original(key);
			});
		const pkg = exportLouvorjaFromBrowser("1.0", "test");
		spy.mockRestore();
		expect(pkg.entities.liturgy?.modified).toBe("");
	});
});
