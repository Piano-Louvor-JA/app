// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	createLocalCollection,
	createLocalLyric,
	createLocalMusic,
	deleteLocalCollection,
	deleteLocalLyric,
	deleteLocalMusic,
	getLocalMusic,
	isLocalId,
	listLocalCollections,
	listLocalMusics,
	publishLocalMusic,
	updateLocalCollection,
	updateLocalLyric,
	updateLocalMusic,
} from "../local-custom-store";

describe("local-custom-store (coletâneas sem auth — ids negativos)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("ids locais são negativos e distintos dos ids da API (positivos)", () => {
		expect(isLocalId(-1)).toBe(true);
		expect(isLocalId(1)).toBe(false);
		expect(isLocalId(2_000_001)).toBe(false);
		expect(isLocalId(null)).toBe(false);
	});

	it("cria coletânea + música + estrofe local", () => {
		const c = createLocalCollection("Minha coletânea");
		expect(c.id).toBeLessThan(0);
		const m = createLocalMusic(c.id, {
			name: "Hino X",
			lyric: "primeira estrofe",
		});
		expect(m.id).toBeLessThan(0);
		expect(m.collectionId).toBe(c.id);
		expect(m.lyrics).toHaveLength(1);
		expect(listLocalCollections()).toHaveLength(1);
		expect(listLocalMusics(c.id)).toHaveLength(1);
	});

	it("update de coletânea, música e estrofe persiste", () => {
		const c = createLocalCollection("antes");
		updateLocalCollection(c.id, { name: "depois" });
		expect(listLocalCollections()[0]?.name).toBe("depois");

		const m = createLocalMusic(c.id, { name: "a" });
		updateLocalMusic(m.id, { name: "b", audioBase64: "QUJD" });
		const stored = getLocalMusic(m.id);
		expect(stored?.name).toBe("b");
		expect(stored?.audioBase64).toBe("QUJD");

		const l = createLocalLyric(m.id, { lyric: "x" });
		updateLocalLyric(l.id, { lyric: "y" });
		expect(getLocalMusic(m.id)?.lyrics[0]?.lyric).toBe("y");
	});

	it("delete coletânea remove músicas junto; delete música/estrofe isolado", () => {
		const c = createLocalCollection("c");
		const m = createLocalMusic(c.id, { name: "m" });
		const l = createLocalLyric(m.id, { lyric: "l" });

		expect(deleteLocalLyric(l.id)).toBe(true);
		expect(getLocalMusic(m.id)?.lyrics).toHaveLength(0);

		expect(deleteLocalMusic(m.id)).toBe(true);
		expect(listLocalMusics(c.id)).toHaveLength(0);

		expect(deleteLocalCollection(c.id)).toBe(true);
		expect(listLocalCollections()).toHaveLength(0);
	});

	it("estado persiste entre leituras (localStorage)", () => {
		createLocalCollection("persistente");
		// segunda leitura vem do localStorage — mesma instância de dados
		expect(listLocalCollections()).toHaveLength(1);
	});

	/* ---------- Draft (SPEC t_deed74b5) ---------- */

	it("draft: música nova nasce 'draft'", () => {
		const c = createLocalCollection("Drafts");
		const m = createLocalMusic(c.id, { name: "Em andamento", lyric: "x" });
		expect(m.status).toBe("draft");
		expect(getLocalMusic(m.id)?.status).toBe("draft");
	});

	it("draft: música legada sem campo lê como 'published' (migração)", () => {
		const c = createLocalCollection("Legado");
		const m = createLocalMusic(c.id, { name: "Antiga", lyric: "y" });
		// simula registro pré-draft: remove o campo do db persistido
		const raw = JSON.parse(localStorage.getItem("louvorja.local-custom.v1")!);
		const row = raw.musics.find((x: { id: number }) => x.id === m.id);
		delete row.status;
		localStorage.setItem("louvorja.local-custom.v1", JSON.stringify(raw));
		expect(getLocalMusic(m.id)?.status).toBe("published");
	});

	it("draft: publishLocalMusic publica; id inexistente → false", () => {
		const c = createLocalCollection("P");
		const m = createLocalMusic(c.id, { name: "Pub", lyric: "z" });
		expect(publishLocalMusic(m.id)).toBe(true);
		expect(getLocalMusic(m.id)?.status).toBe("published");
		expect(publishLocalMusic(-99999)).toBe(false);
	});

	it("draft: copyCustomMusic (destino local) preserva status da origem", async () => {
		const { copyCustomMusic } = await import("../custom-catalog");
		const srcCol = createLocalCollection("Origem draft");
		const src = createLocalMusic(srcCol.id, { name: "Rascunho copiável", lyric: "w" });
		expect(src.status).toBe("draft");
		const dst = createLocalCollection("Destino draft");
		const result = await copyCustomMusic(dst.id, src.id);
		expect(result).not.toBeNull();
		const copied = getLocalMusic(result!.id)!;
		expect(copied.status).toBe("draft");
		// origem publicada (outro nome p/ não cair no dedupe) → cópia publicada
		const src2 = createLocalMusic(srcCol.id, { name: "Publicado copiável", lyric: "v" });
		publishLocalMusic(src2.id);
		const result2 = await copyCustomMusic(dst.id, src2.id);
		const copied2 = getLocalMusic(result2!.id)!;
		expect(copied2.status).toBe("published");
	});
});
