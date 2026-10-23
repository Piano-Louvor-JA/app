import { afterEach, describe, expect, it, vi } from "vitest";

import {
	isIndependentProjectionLocation,
	isProjectionPopupLocation,
} from "../projection-window-location";

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

describe("isIndependentProjectionLocation", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["file:///app/index.html#/popup?module=clock&independent=1", "/app/index.html", true],
		["http://localhost:5173/popup?independent=1&module=timer", "/popup", true],
		["file:///app/index.html#/popup?module=clock", "/app/index.html", false],
		["file:///app/index.html#/popup?module=clock&independent=10", "/app/index.html", false],
		["https://app.local/#/home?independent=1", "/home", false],
	])("%s → %s", (href, path, expected) => {
		setLocation(href, path);
		expect(isIndependentProjectionLocation()).toBe(expected);
	});
});
