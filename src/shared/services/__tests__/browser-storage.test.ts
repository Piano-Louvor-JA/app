import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	getBrowserItem,
	removeBrowserItem,
	removeBrowserItemsByPrefix,
	setBrowserItem,
} from "../browser-storage";

describe("browser-storage", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("setBrowserItem serializa objetos em JSON (local)", () => {
		setBrowserItem("k1", { a: 1 });
		expect(localStorage.getItem("k1")).toBe('{"a":1}');
	});

	it("setBrowserItem serializa primitivos com String()", () => {
		setBrowserItem("n", 42);
		expect(localStorage.getItem("n")).toBe("42");
		setBrowserItem("b", true);
		expect(localStorage.getItem("b")).toBe("true");
	});

	it("setBrowserItem usa sessionStorage quando kind=session", () => {
		setBrowserItem("s1", { x: 2 }, "session");
		expect(sessionStorage.getItem("s1")).toBe('{"x":2}');
		expect(localStorage.getItem("s1")).toBeNull();
	});

	it("getBrowserItem faz parse do JSON", () => {
		localStorage.setItem("obj", '{"a":[1,2]}');
		expect(getBrowserItem("obj")).toEqual({ a: [1, 2] });
	});

	it("getBrowserItem devolve fallback quando chave ausente", () => {
		expect(getBrowserItem("missing")).toBeNull();
		expect(getBrowserItem("missing", "padrao")).toBe("padrao");
		expect(getBrowserItem<number>("missing", 7)).toBe(7);
	});

	it("getBrowserItem devolve raw quando JSON inválido", () => {
		localStorage.setItem("broken", "nao-json{{{");
		expect(getBrowserItem("broken")).toBe("nao-json{{{");
	});

	it("getBrowserItem lê do sessionStorage", () => {
		sessionStorage.setItem("sk", '"ses"');
		expect(getBrowserItem("sk", null, "session")).toBe("ses");
	});

	it("removeBrowserItem remove do storage correto", () => {
		localStorage.setItem("rm", "1");
		sessionStorage.setItem("rm", "2");
		removeBrowserItem("rm");
		expect(localStorage.getItem("rm")).toBeNull();
		expect(sessionStorage.getItem("rm")).toBe("2");
		removeBrowserItem("rm", "session");
		expect(sessionStorage.getItem("rm")).toBeNull();
	});
});

describe("removeBrowserItemsByPrefix — storage completo (length/key)", () => {
	it("itera de trás pra frente e remove só o prefixo", () => {
		const store = new Map<string, string>([
			["pre-a", "1"],
			["pre-b", "2"],
			["other", "3"],
		]);
		const full: Storage = {
			length: store.size,
			clear: vi.fn(),
			getItem: (k: string) => store.get(k) ?? null,
			key: (
				(keys: string[]) => (i: number) =>
					keys[i] ?? null
			)(Array.from(store.keys())),
			removeItem: (k: string) => void store.delete(k),
			setItem: (k: string, v: string) => void store.set(k, v),
		};
		vi.stubGlobal("localStorage", full);
		removeBrowserItemsByPrefix("pre-");
		expect(store.has("pre-b")).toBe(false);
		expect(store.get("other")).toBe("3");
		vi.unstubAllGlobals();
	});

	it("key null não quebra (guard key?.startsWith)", () => {
		let calls = 0;
		const store = new Map<string, string>([
			["p-1", "x"],
			["p-2", "y"],
		]);
		const full: Storage = {
			length: 2,
			clear: vi.fn(),
			getItem: (k: string) => store.get(k) ?? null,
			key: (i: number) => {
				calls += 1;
				if (i === 0) return null; // simula key null
				return Array.from(store.keys())[i] ?? null;
			},
			removeItem: (k: string) => void store.delete(k),
			setItem: (k: string, v: string) => void store.set(k, v),
		};
		vi.stubGlobal("sessionStorage", full);
		removeBrowserItemsByPrefix("p-", "session");
		// ambas ainda presentes (key(0)=null pula, key(1)='p-1' sem prefixo? índice 1 = p-1)
		expect(store.size).toBeGreaterThan(0);
		vi.unstubAllGlobals();
	});
});
