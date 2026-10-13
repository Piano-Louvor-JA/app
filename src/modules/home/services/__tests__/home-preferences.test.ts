import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura de home-preferences.ts — normalize/load/save do perfil de
 * localização da Home.
 */

const getUserPreference = vi.fn();
const setUserPreference = vi.fn();
vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: (...a: unknown[]) => getUserPreference(...(a as [])),
	setUserPreference: (...a: unknown[]) => setUserPreference(...(a as [])),
}));

import {
	loadHomeLocation,
	normalizeHomeLocation,
	saveHomeLocation,
} from "../home-preferences";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("normalizeHomeLocation", () => {
	it("não-objeto -> default", () => {
		expect(normalizeHomeLocation(null)).toEqual({ district: "", church: "" });
		expect(normalizeHomeLocation("x")).toEqual({ district: "", church: "" });
		expect(normalizeHomeLocation(42)).toEqual({ district: "", church: "" });
	});

	it("trim de strings; não-string -> vazio", () => {
		const r = normalizeHomeLocation({
			district: "  Distrito  ",
			church: 123,
		});
		expect(r).toEqual({ district: "Distrito", church: "" });
	});
});

describe("load/save", () => {
	it("load delega ao getUserPreference e normaliza", () => {
		getUserPreference.mockReturnValue({ district: " D ", church: " C " });
		const r = loadHomeLocation();
		expect(getUserPreference).toHaveBeenCalled();
		expect(r).toEqual({ district: "D", church: "C" });
	});

	it("save trima e persiste via setUserPreference", () => {
		saveHomeLocation({ district: "  A  ", church: "  B  " });
		expect(setUserPreference).toHaveBeenCalledWith(expect.any(String), {
			district: "A",
			church: "B",
		});
	});
});
