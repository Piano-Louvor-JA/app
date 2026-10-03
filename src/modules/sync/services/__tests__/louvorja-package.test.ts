import { describe, expect, it } from "vitest";

import {
	decodeLouvorjaPackage,
	mergeEntities,
	encodeLouvorjaPackage,
	LOUVORJA_SCHEMA_VERSION,
	type LouvorjaSyncEntity,
	type LouvorjaSyncPackage,
} from "../louvorja-package";

function entity(type: string, iso: string): LouvorjaSyncEntity {
	return { type, modified: iso, data: { foo: "bar" } };
}

function pkg(
	overrides: Partial<LouvorjaSyncPackage> = {},
): LouvorjaSyncPackage {
	return {
		schema: LOUVORJA_SCHEMA_VERSION,
		appVersion: "1.17.5",
		platform: "desktop",
		exportedAt: "2026-08-16T00:00:00.000Z",
		entities: { liturgy: entity("liturgy", "2026-08-15T10:00:00.000Z") },
		...overrides,
	};
}

describe("encodeLouvorjaPackage", () => {
	it("serializa pacote como JSON string", () => {
		const raw = encodeLouvorjaPackage(pkg());
		expect(typeof raw).toBe("string");
		expect(JSON.parse(raw).schema).toBe(1);
	});
});

describe("decodeLouvorjaPackage", () => {
	it("decodifica pacote válido", () => {
		const raw = encodeLouvorjaPackage(pkg());
		const decoded = decodeLouvorjaPackage(raw);
		expect(decoded.schema).toBe(1);
		expect(decoded.entities.liturgy?.type).toBe("liturgy");
	});

	it("aceita JSON com campos extras (forward-compatible)", () => {
		const raw = JSON.stringify({ ...pkg(), extra: "ignored" });
		expect(() => decodeLouvorjaPackage(raw)).not.toThrow();
	});

	it("rejeita JSON inválido", () => {
		expect(() => decodeLouvorjaPackage("{nope")).toThrow();
	});

	it("rejeita schema do futuro", () => {
		const raw = JSON.stringify({ ...pkg(), schema: 99 });
		expect(() => decodeLouvorjaPackage(raw)).toThrow(/schema/i);
	});

	it("rejeita valor não-objeto", () => {
		expect(() => decodeLouvorjaPackage("42")).toThrow();
		expect(() => decodeLouvorjaPackage("null")).toThrow();
		expect(() => decodeLouvorjaPackage('"str"')).toThrow();
	});

	it("tolera entidade sem campos opcionais", () => {
		const raw = JSON.stringify({
			schema: 1,
			entities: { liturgy: { type: "liturgy" } },
		});
		const decoded = decodeLouvorjaPackage(raw);
		expect(decoded.entities.liturgy?.data).toEqual({});
	});

	it("ignora entidades nulas e usa a chave como tipo padrão", () => {
		const decoded = decodeLouvorjaPackage(
			JSON.stringify({
				schema: 1,
				entities: { ignored: null, timerPresets: { data: [] } },
			}),
		);
		expect(decoded.entities).toEqual({
			timerPresets: { type: "timerPresets", modified: "", data: {} },
		});
	});

	it("tolera entities ausentes", () => {
		const raw = JSON.stringify({ schema: 1 });
		const decoded = decodeLouvorjaPackage(raw);
		expect(decoded.entities).toEqual({});
	});
});

describe("mergeLouvorjaPackages (LWW)", () => {
	it.skip("placeholder — merge testado via mergeEntities", () => {});
});

describe("mergeEntities", () => {
	it("mantém entidade local quando é mais nova", async () => {
		const { mergeEntities } = await import("../louvorja-package");
		const local: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-16T00:00:00.000Z",
			data: { v: "local" },
		};
		const remote: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-15T00:00:00.000Z",
			data: { v: "remote" },
		};
		const merged = mergeEntities(local, remote);
		expect(merged.data).toEqual({ v: "local" });
	});

	it("troca para remota quando é mais nova", async () => {
		const { mergeEntities } = await import("../louvorja-package");
		const local: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-15T00:00:00.000Z",
			data: { v: "local" },
		};
		const remote: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-16T00:00:00.000Z",
			data: { v: "remote" },
		};
		const merged = mergeEntities(local, remote);
		expect(merged.data).toEqual({ v: "remote" });
	});

	it("prefere remota em empate (import aplica)", async () => {
		const { mergeEntities } = await import("../louvorja-package");
		const local: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-15T00:00:00.000Z",
			data: { v: "local" },
		};
		const remote: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-15T00:00:00.000Z",
			data: { v: "remote" },
		};
		const merged = mergeEntities(local, remote);
		expect(merged.data).toEqual({ v: "remote" });
	});

	it("timestamp inválido perde para válido", async () => {
		const { mergeEntities } = await import("../louvorja-package");
		const local: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "",
			data: { v: "local" },
		};
		const remote: LouvorjaSyncEntity = {
			type: "liturgy",
			modified: "2026-08-16T00:00:00.000Z",
			data: { v: "remote" },
		};
		const merged = mergeEntities(local, remote);
		expect(merged.data).toEqual({ v: "remote" });
	});
});

describe("fileNameFor", () => {
	it("gera nome canônico louvorja-AAAA-MM-DD.louvorja", async () => {
		const { fileNameFor } = await import("../louvorja-package");
		const name = fileNameFor(new Date("2026-08-16T12:00:00Z"));
		expect(name).toMatch(/^louvorja-\d{4}-\d{2}-\d{2}\.louvorja$/);
	});
});

describe("isValidLouvorjaContent", () => {
	it("aceita conteúdo válido", async () => {
		const { isValidLouvorjaContent } = await import("../louvorja-package");
		expect(isValidLouvorjaContent(encodeLouvorjaPackage(pkg()))).toBe(true);
	});

	it("rejeita lixo", async () => {
		const { isValidLouvorjaContent } = await import("../louvorja-package");
		expect(isValidLouvorjaContent("not json")).toBe(false);
	});
  describe("gaps — mergeEntities LWW", () => {
    it("remote mais recente vence", () => {
      const local = { id: "1", kind: "playlist" as const, modified: "2026-01-01T00:00:00Z", payload: { a: 1 } };
      const remote = { id: "1", kind: "playlist" as const, modified: "2026-06-01T00:00:00Z", payload: { a: 2 } };
      expect(mergeEntities(local as never, remote as never).payload).toEqual({ a: 2 });
    });

    it("local mais recente vence", () => {
      const local = { id: "1", kind: "playlist" as const, modified: "2026-06-01T00:00:00Z", payload: { a: 1 } };
      const remote = { id: "1", kind: "playlist" as const, modified: "2026-01-01T00:00:00Z", payload: { a: 2 } };
      expect(mergeEntities(local as never, remote as never).payload).toEqual({ a: 1 });
    });

    it("empate: prefere remote", () => {
      const ts = "2026-06-01T00:00:00Z";
      const local = { id: "1", kind: "playlist" as const, modified: ts, payload: { a: 1 } };
      const remote = { id: "1", kind: "playlist" as const, modified: ts, payload: { a: 2 } };
      expect(mergeEntities(local as never, remote as never).payload).toEqual({ a: 2 });
    });

    it("timestamp inválido: prefere remote", () => {
      const local = { id: "1", kind: "playlist" as const, modified: "não-é-data", payload: { a: 1 } };
      const remote = { id: "1", kind: "playlist" as const, modified: "2026-06-01T00:00:00Z", payload: { a: 2 } };
      expect(mergeEntities(local as never, remote as never).payload).toEqual({ a: 2 });
    });
  });

});