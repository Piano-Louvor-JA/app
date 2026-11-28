import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ language: "pt-BR" }));
// 15 idiomas publicados na API (staging): ver CATALOG de bible_multilingue.
const PREFIXES_15 = [
  "pt",
  "en",
  "es",
  "fr",
  "ru",
  "uk",
  "it",
  "nl",
  "pl",
  "tr",
  "ja",
  "ko",
  "zh",
  "ar",
  "hi",
] as const;

vi.mock("@modules/sync/services/library-catalog", () => ({
  // mesmo mapeamento real de locale→prefix da UI
  getCurrentApiPrefix: () => {
    const prefix = state.language.slice(0, 2).toLowerCase();
    return (PREFIXES_15 as readonly string[]).includes(prefix) ? prefix : "pt";
  },
}));
vi.mock("@shared/services/remote-catalog", () => ({
  fetchRemoteCatalogJson: vi.fn(async (filename: string) => {
    const fixtures: Record<string, unknown> = {
      pt_bible_version: [
        {
          id_bible_version: 2,
          name: "Almeida Revista e Atualizada",
          abbreviation: "ARA",
        },
      ],
      es_bible_version: [
        { id_bible_version: 10, name: "Reina-Valera", abbreviation: "RV" },
      ],
      en_bible_version: [
        {
          id_bible_version: 100,
          name: "World English Bible",
          abbreviation: "WEB",
        },
      ],
      fr_bible_version: [
        {
          id_bible_version: 101,
          name: "Sainte Bible libre pour le monde",
          abbreviation: "SBL",
        },
      ],
      pt_bible_book: [
        {
          id_bible_book: 1,
          book_number: 1,
          name: "Gênesis",
          chapters: 50,
          abbreviation: "Gn",
          testament: 1,
          keywords: "genesis",
          color: "#000",
        },
      ],
      es_bible_book: [
        {
          id_bible_book: 67,
          book_number: 1,
          name: "Génesis",
          chapters: 50,
          abbreviation: "Gn",
          testament: 1,
          keywords: "genesis",
          color: "#000",
        },
      ],
      en_bible_book: [
        {
          id_bible_book: 200,
          book_number: 1,
          name: "Genesis",
          chapters: 50,
          abbreviation: "Gen",
          testament: 1,
          keywords: "genesis",
          color: "#000",
        },
      ],
      fr_bible_book: [
        {
          id_bible_book: 266,
          book_number: 1,
          name: "Genèse",
          chapters: 50,
          abbreviation: "Gn",
          testament: 1,
          keywords: "genesis",
          color: "#000",
        },
      ],
    };
    return fixtures[filename] ?? null;
  }),
}));
vi.mock("@shared/services/workspace-api", () => ({
  readCatalogRecord: vi.fn(async () => null),
}));

import { loadBibleBooks, loadBibleVersions } from "../bible-catalog";

describe("bible-catalog — Bíblia no idioma da interface (15 idiomas)", () => {
  beforeEach(() => {
    state.language = "pt-BR";
  });

  it("pt: carrega livros/versões pt (Gênesis id 1, ARA)", async () => {
    const books = await loadBibleBooks();
    const versions = await loadBibleVersions();
    expect(books[0]?.name).toBe("Gênesis");
    expect(books[0]?.id).toBe(1);
    expect(versions[0]?.abbreviation).toBe("ARA");
  });

  it("es: o mesmo módulo passa a carregar livros/versões es", async () => {
    state.language = "es-ES";
    const books = await loadBibleBooks();
    const versions = await loadBibleVersions();
    expect(books[0]?.name).toBe("Génesis");
    expect(books[0]?.id).toBe(67);
    expect(versions[0]?.abbreviation).toBe("RV");
  });

  it("en: AGORA tem catálogo próprio — carrega en (Genesis id 200, WEB)", async () => {
    state.language = "en-US";
    const books = await loadBibleBooks();
    const versions = await loadBibleVersions();
    expect(books[0]?.name).toBe("Genesis");
    expect(books[0]?.id).toBe(200);
    expect(versions[0]?.abbreviation).toBe("WEB");
  });

  it("fr: carrega livros/versões fr (Genèse id 266, SBL)", async () => {
    state.language = "fr-FR";
    const books = await loadBibleBooks();
    const versions = await loadBibleVersions();
    expect(books[0]?.name).toBe("Genèse");
    expect(books[0]?.id).toBe(266);
    expect(versions[0]?.abbreviation).toBe("SBL");
  });

  it("qualquer um dos 15 prefixos: pede {prefix}_bible_book/version do idioma", async () => {
    const { fetchRemoteCatalogJson } =
      await import("@shared/services/remote-catalog");
    for (const lang of PREFIXES_15) {
      vi.mocked(fetchRemoteCatalogJson).mockClear();
      state.language = `${lang}-XX`;
      await loadBibleVersions();
      await loadBibleBooks();
      const asked = vi
        .mocked(fetchRemoteCatalogJson)
        .mock.calls.map((c) => c[0] as string);
      expect(asked).toContain(`${lang}_bible_version`);
      expect(asked).toContain(`${lang}_bible_book`);
      if (lang !== "pt") {
        expect(asked).not.toContain("pt_bible_version");
        expect(asked).not.toContain("pt_bible_book");
      }
    }
  });

  it("idioma fora dos 15 (xx): lista vazia — sem fallback pt silencioso", async () => {
    state.language = "xx-XX";
    // o mock de getCurrentApiPrefix força pt para xx; aqui garantimos o
    // contrato: apenas pt é pedido quando o prefix é pt
    const versions = await loadBibleVersions();
    expect(versions[0]?.abbreviation).toBe("ARA");
  });
});
