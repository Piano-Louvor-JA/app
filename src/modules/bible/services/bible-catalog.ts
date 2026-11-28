import { getDesktopBridge } from "@shared/services/desktop-bridge";
import { fetchRemoteCatalogJson } from "@shared/services/remote-catalog";
import {
  readCatalogRecord,
  writeCatalogRecord,
} from "@shared/services/workspace-api";
import { syncBundle } from "@shared/services/bundle-sync-client";

import type {
  BibleBook,
  BibleBookTone,
  BibleChapterVerses,
  BibleTestament,
  BibleVersion,
  CatalogBibleBookRow,
  CatalogBibleVersionRow,
} from "../types/bible";

/**
 * Prefixos com catálogo de Bíblia publicado no upstream (api-stg): 15 idiomas
 * da campanha i18n (pt/en/es + ru/uk/fr/it/nl/pl/tr/ja/ko/zh/ar/hi — versões
 * 100–112). Idioma fora da lista → null → lista vazia + convite à comunidade
 * (mesmo contrato do hinário, app#convite-catalogo) — NÃO fallback pt.
 */
const BIBLE_CATALOG_PREFIXES = new Set([
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
]);

async function bibleCatalogFile(
  kind: "book" | "version",
): Promise<string | null> {
  const { getCurrentApiPrefix } =
    await import("@modules/sync/services/library-catalog");
  const prefix = getCurrentApiPrefix();
  if (!BIBLE_CATALOG_PREFIXES.has(prefix)) return null;
  return kind === "book" ? `${prefix}_bible_book` : `${prefix}_bible_version`;
}

/** Abreviações conhecidas quando o catálogo/API vem com abbreviation vazia/null. */
const VERSION_ABBREVIATION_BY_NAME: Array<{ match: RegExp; abbr: string }> = [
  { match: /nova\s+almeida\s+atualizada/i, abbr: "NAA" },
  { match: /almeida\s+corrigida\s+e\s+revisada\s+fiel/i, abbr: "ACRF" },
  { match: /almeida\s+corrigida\s+e\s+fiel/i, abbr: "ACF" },
  { match: /almeida\s+revisada\s+imprensa/i, abbr: "ARIB" },
  { match: /almeida\s+revista\s+e\s+atualizada/i, abbr: "ARA" },
  { match: /almeida\s+revista\s+e\s+corrigida/i, abbr: "ARC" },
  { match: /king\s+james\s+atualizada/i, abbr: "KJA" },
  { match: /nova\s+vers[aã]o\s+internacional/i, abbr: "NVI" },
  { match: /sagradas\s+escrituras/i, abbr: "SEV" },
  { match: /reina[-\s]?valera\s*1989/i, abbr: "RVA" },
  { match: /reina[-\s]?valera/i, abbr: "RV" },
];

function cleanCatalogText(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (
    !text ||
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "undefined"
  ) {
    return "";
  }
  return text;
}

/** Evita `String(null) === "null"` e completa abreviação a partir do nome/id. */
export function resolveVersionAbbreviation(
  abbreviation: unknown,
  name: unknown,
  versionId?: unknown,
): string {
  const fromField = cleanCatalogText(abbreviation);
  if (fromField) return fromField;

  const versionName = cleanCatalogText(name);
  for (const entry of VERSION_ABBREVIATION_BY_NAME) {
    if (entry.match.test(versionName)) return entry.abbr;
  }

  const idText = cleanCatalogText(versionId);
  if (/^[a-z]{2,6}$/i.test(idText)) return idText.toUpperCase();

  return "";
}

function mapBook(row: CatalogBibleBookRow): BibleBook {
  return {
    id: Number(row.id_bible_book),
    name: cleanCatalogText(row.name) || String(row.name ?? ""),
    abbreviation: cleanCatalogText(row.abbreviation),
    chapters: Number(row.chapters) || 0,
    bookNumber: Number(row.book_number) || 0,
    languageId: cleanCatalogText(row.id_language) || "pt",
  };
}

function mapVersion(row: CatalogBibleVersionRow): BibleVersion {
  const name = cleanCatalogText(row.name) || String(row.name ?? "");
  return {
    id: Number(row.id_bible_version),
    abbreviation: resolveVersionAbbreviation(
      row.abbreviation,
      name,
      row.id_bible_version,
    ),
    name,
    languageId: cleanCatalogText(row.id_language) || "pt",
  };
}

async function readOrFetchCatalog<T>(filename: string): Promise<T | null> {
  const local = await readCatalogRecord<T>(filename);
  if (local != null) return local;

  try {
    return await fetchRemoteCatalogJson<T>(filename);
  } catch (error) {
    console.warn(`[bible] falha ao obter catálogo ${filename}`, error);
    return null;
  }
}

export function resolveTestament(bookNumber: number): BibleTestament {
  return bookNumber <= 39 ? "ot" : "nt";
}

/** Tom visual do tile conforme faixas canônicas. */
export function resolveBookTone(bookNumber: number): BibleBookTone {
  if (bookNumber <= 5) return "law";
  if (bookNumber <= 17) return "history";
  if (bookNumber <= 22) return "poetry";
  if (bookNumber <= 27) return "major-prophet";
  if (bookNumber <= 39) return "minor-prophet";
  if (bookNumber <= 43) return "gospels";
  if (bookNumber === 44) return "acts";
  if (bookNumber <= 57) return "pauline";
  if (bookNumber <= 65) return "general";
  if (bookNumber === 66) return "apocalyptic";
  return "neutral";
}

export function chapterRecordKey(
  versionId: number,
  bookId: number,
  chapter: number,
): string {
  return `bible_${versionId}_${bookId}_${chapter}`;
}

export async function loadBibleBooks(): Promise<BibleBook[]> {
  const filename = await bibleCatalogFile("book");
  if (!filename) return [];
  const rows = await readOrFetchCatalog<CatalogBibleBookRow[]>(filename);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map(mapBook);
}

export async function loadBibleVersions(): Promise<BibleVersion[]> {
  const filename = await bibleCatalogFile("version");
  if (!filename) return [];
  const rows = await readOrFetchCatalog<CatalogBibleVersionRow[]>(filename);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map(mapVersion);
}

function isChapterVerses(value: unknown): value is BibleChapterVerses {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/** Bundle offline (atualização baixada > instalador), lido pelo main. */
async function readBundledChapter(
  versionId: number,
  bookId: number,
  chapter: number,
): Promise<BibleChapterVerses | null> {
  const bible = getDesktopBridge()?.bible;
  if (!bible) return null;
  try {
    const verses = await bible.getChapter(versionId, bookId, chapter);
    return isChapterVerses(verses) ? verses : null;
  } catch (error) {
    console.warn("[bible] falha ao ler bundle offline", error);
    return null;
  }
}

/**
 * Ordem: bundle offline → capítulo salvo no disco → API. O que vem da API
 * fica salvo no disco, para a próxima leitura não depender de rede.
 */
export async function loadChapterVerses(
  versionId: number,
  bookId: number,
  chapter: number,
): Promise<BibleChapterVerses> {
  const bundled = await readBundledChapter(versionId, bookId, chapter);
  if (bundled) return bundled;

  const key = chapterRecordKey(versionId, bookId, chapter);
  const local = await readCatalogRecord<BibleChapterVerses>(key);
  if (isChapterVerses(local)) return local;

  // SPEC piano-bundle-sync: 1 request do bible-bundle antes do fetch
  // capítulo a capítulo (ADR-03 — fallback legado se o bundle falhar).
  try {
    const bundleResult = await syncBundle("bible");
    if (bundleResult != null && "records" in bundleResult) {
      const bundled = await readCatalogRecord<BibleChapterVerses>(key);
      if (isChapterVerses(bundled)) return bundled;
    }
  } catch {
    // bundle nunca bloqueia o fluxo legado
  }

  let remote: unknown;
  try {
    remote = await fetchRemoteCatalogJson<BibleChapterVerses>(key);
  } catch (error) {
    console.warn(`[bible] falha ao obter capítulo ${key}`, error);
    return {};
  }
  if (!isChapterVerses(remote)) return {};

  try {
    await writeCatalogRecord(key, remote);
  } catch (error) {
    console.warn(`[bible] falha ao salvar capítulo ${key}`, error);
  }
  return remote;
}

/**
 * Pede ao main para conferir bundles novos na API (o main limita a 1x/dia).
 * Nunca lança: atualização é melhor esforço e não afeta a leitura.
 */
export async function requestBibleBundleUpdate(): Promise<void> {
  try {
    await getDesktopBridge()?.bible?.checkUpdates?.();
  } catch (error) {
    console.warn("[bible] falha ao verificar atualização da Bíblia", error);
  }
}

/** Preferência padrão: ARA, senão a primeira versão. */
export function pickDefaultVersionId(
  versions: BibleVersion[],
  savedId: number | null,
): number | null {
  if (versions.length === 0) return null;

  if (savedId != null && versions.some((version) => version.id === savedId)) {
    return savedId;
  }

  const ara = versions.find(
    (version) =>
      version.abbreviation.toUpperCase() === "ARA" ||
      version.name.toUpperCase() === "ARA",
  );
  return ara?.id ?? versions[0].id;
}
