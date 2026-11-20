import { describe, expect, it, vi } from "vitest";

import { useHomeLocation } from "../useHomeLocation";

const { loadMock, saveMock } = vi.hoisted(() => ({
	loadMock: vi.fn(() => ({ district: "", church: "" })),
	saveMock: vi.fn(),
}));

vi.mock("../../services/home-preferences", () => ({
	loadHomeLocation: loadMock,
	saveHomeLocation: saveMock,
}));

describe("useHomeLocation", () => {
	it("carrega o perfil salvo e expõe flags vazias", () => {
		const { profile, hasDistrict, hasChurch } = useHomeLocation();
		expect(profile.value).toEqual({ district: "", church: "" });
		expect(hasDistrict.value).toBe(false);
		expect(hasChurch.value).toBe(false);
	});

	it("normaliza espaços ao persistir", () => {
		const { setDistrict } = useHomeLocation();
		setDistrict("  Distrito 7  ");
		expect(saveMock).toHaveBeenCalledWith({
			district: "Distrito 7",
			church: "",
		});
	});

	it("setChurch persiste a igreja normalizada", () => {
		const { setChurch, hasChurch } = useHomeLocation();
		setChurch(" IASD Centro ");
		expect(saveMock).toHaveBeenCalledWith({
			district: "",
			church: "IASD Centro",
		});
		expect(hasChurch.value).toBe(true);
	});

	it("hasDistrict reflete distrito carregado", () => {
		loadMock.mockReturnValueOnce({ district: "D1", church: "" });
		const { hasDistrict } = useHomeLocation();
		expect(hasDistrict.value).toBe(true);
	});
});
