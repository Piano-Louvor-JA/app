import { afterEach, describe, expect, it, vi } from "vitest";

import { isProjectionPopupLocation } from "../projection-window-location";

const setLocation = (href: string, path: string) => {
	vi.stubGlobal("window", {
		location: { href, pathname: path },
	});
};

describe("isProjectionPopupLocation", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("retorna false sem window (SSR)", () => {
		vi.stubGlobal("window", undefined);
		expect(isProjectionPopupLocation()).toBe(false);
	});

	it.each([
		["https://app.local/#/popup", "/"],
		["https://app.local/popup?", "/"],
		["https://app.local/popup?", "/popup?"],
	])("detecta popup por href %s / path %s", (href, path) => {
		setLocation(href, path);
		expect(isProjectionPopupLocation()).toBe(true);
	});

	it("retorna false fora do popup", () => {
		setLocation("https://app.local/#/home", "/home");
		expect(isProjectionPopupLocation()).toBe(false);
	});
});
