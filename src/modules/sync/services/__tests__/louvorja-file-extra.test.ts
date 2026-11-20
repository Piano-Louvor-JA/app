// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportLouvorjaFile, importLouvorjaFile } from "../louvorja-file";

afterEach(() => {
	vi.restoreAllMocks();
	// @ts-expect-error limpar picker injetado
	delete window.showSaveFilePicker;
	// @ts-expect-error limpar picker injetado
	delete window.showOpenFilePicker;
});

const origCreate = document.createElement.bind(document);
const stubAnchorClick = () => {
	vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
		const el = origCreate(tag);
		if (tag === "a") {
			Object.defineProperty(el, "click", { value: vi.fn() });
		}
		return el;
	});
};

describe("exportLouvorjaFile", () => {
	it("sem picker → download fallback", async () => {
		const createObjectURL = vi.fn(() => "blob:x");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
		stubAnchorClick();
		const ok = await exportLouvorjaFile('{"pacote":true}');
		expect(ok).toBe(true);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
		vi.unstubAllGlobals();
	});

	it("download fallback com erro → false", async () => {
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: () => {
				throw new Error("no blob");
			},
		});
		expect(await exportLouvorjaFile("x")).toBe(false);
		vi.unstubAllGlobals();
	});

	it("picker disponível → escreve e retorna true", async () => {
		const write = vi.fn();
		const close = vi.fn();
		const createWritable = vi.fn(async () => ({ write, close }));
		(window as any).showSaveFilePicker = vi.fn(async () => ({
			createWritable,
		}));
		const ok = await exportLouvorjaFile("dados");
		expect(ok).toBe(true);
		expect(write).toHaveBeenCalled();
		expect(close).toHaveBeenCalled();
	});

	it("picker abortado (AbortError) → false sem fallback", async () => {
		(window as any).showSaveFilePicker = vi.fn(async () => {
			throw new DOMException("cancel", "AbortError");
		});
		const createObjectURL = vi.fn();
		vi.stubGlobal("URL", { ...URL, createObjectURL });
		expect(await exportLouvorjaFile("x")).toBe(false);
		expect(createObjectURL).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("picker com erro não-abort → fallback download", async () => {
		(window as any).showSaveFilePicker = vi.fn(async () => {
			throw new Error("disk full");
		});
		const createObjectURL = vi.fn(() => "blob:y");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
		stubAnchorClick();
		expect(await exportLouvorjaFile("x")).toBe(true);
		expect(revokeObjectURL).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe("importLouvorjaFile", () => {
	it("sem picker → input fallback (sem arquivo escolhido)", async () => {
		// click dispara onchange com input vazio → null
		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			const el = origCreate(tag);
			if (tag === "input") {
				queueMicrotask(() => el.onchange?.(new Event("change")));
			}
			return el;
		});
		expect(await importLouvorjaFile()).toBeNull();
	});

	it("picker disponível → lê texto do arquivo", async () => {
		(window as any).showOpenFilePicker = vi.fn(async () => [
			{ getFile: async () => ({ text: async () => "CONTEUDO" }) },
		]);
		expect(await importLouvorjaFile()).toBe("CONTEUDO");
	});

	it("picker retorna lista vazia → null", async () => {
		(window as any).showOpenFilePicker = vi.fn(async () => []);
		expect(await importLouvorjaFile()).toBeNull();
	});

	it("picker abortado → null", async () => {
		(window as any).showOpenFilePicker = vi.fn(async () => {
			throw new DOMException("cancel", "AbortError");
		});
		expect(await importLouvorjaFile()).toBeNull();
	});

	it("picker com erro genérico → null", async () => {
		(window as any).showOpenFilePicker = vi.fn(async () => {
			throw new Error("perm");
		});
		expect(await importLouvorjaFile()).toBeNull();
	});

	it("input fallback com arquivo escolhido → texto", async () => {
		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			const el = origCreate(tag);
			if (tag === "input") {
				Object.defineProperty(el, "files", {
					value: [{ text: async () => "DO INPUT" }],
				});
				queueMicrotask(() => el.onchange?.(new Event("change")));
			}
			return el;
		});
		expect(await importLouvorjaFile()).toBe("DO INPUT");
	});

	it("input fallback com falha na leitura → null", async () => {
		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			const el = origCreate(tag);
			if (tag === "input") {
				Object.defineProperty(el, "files", {
					value: [
						{
							text: async () => {
								throw new Error("read fail");
							},
						},
					],
				});
				queueMicrotask(() => el.onchange?.(new Event("change")));
			}
			return el;
		});
		expect(await importLouvorjaFile()).toBeNull();
	});
});
