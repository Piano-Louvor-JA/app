/** Livro bíblico (registro do catálogo). */
export interface BibleBook {
  id: number
  name: string
  abbreviation: string
  chapters: number
  bookNumber: number
  languageId: string
}

/** Versão/tradução disponível. */
export interface BibleVersion {
  id: number
  abbreviation: string
  name: string
  languageId: string
}

/** Versículos de um capítulo: número → texto. */
export type BibleChapterVerses = Record<string, string>

export type BibleTestament = 'ot' | 'nt'

/** Tom visual do tile do livro — categorias canônicas. */
export type BibleBookTone =
  // AT — Pentateuco, Históricos, Poéticos, Profetas Maiores/Menores
  | 'law'          // Pentateuco (1-5)
  | 'history'      // Históricos AT (6-17)
  | 'poetry'       // Poéticos/Sapienciais (18-22)
  | 'major-prophet'// Profetas Maiores (23-27)
  | 'minor-prophet'// Profetas Menores (28-39)
  // NT — Evangelhos, Atos, Cartas Paulinas, Cartas Gerais, Apocalipse
  | 'gospels'      // Evangelhos (40-43)
  | 'acts'         // Atos (44)
  | 'pauline'      // Cartas Paulinas (45-57)
  | 'general'      // Cartas Gerais (58-65)
  | 'apocalyptic'  // Apocalipse (66)
  | 'neutral'      // fallback

/** Seleção ativa para leitura e projeção. */
export interface BibleSelection {
  versionId: number | null
  bookId: number | null
  versionAbbreviation: string
  bookName: string
  chapter: number | null
  verses: number[]
  scripturalReference: string
  text: string
}

/** Payload bruto do workspace (`pt_bible_book`). */
export interface CatalogBibleBookRow {
  id_bible_book: number
  name: string
  abbreviation: string
  chapters: number
  book_number: number
  id_language: string
}

/** Payload bruto do workspace (`pt_bible_version`). */
export interface CatalogBibleVersionRow {
  id_bible_version: number
  abbreviation: string
  name: string
  id_language: string
}
