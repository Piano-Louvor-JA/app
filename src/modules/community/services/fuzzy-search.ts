/**
 * Busca fuzzy da Comunidade (feedback premium/clean 23/11): uma única busca
 * que casa título e autor de forma tolerante — substring normalizada OU
 * fuzzy por palavra (distância de edição ≤ 1), reusando os helpers já
 * provados do app#346 (liturgy-music-search) — mesmo algoritmo, sem
 * reimplementar Levenshtein.
 */
import {
	levenshteinWithin,
	normalizeSearchText,
} from "@modules/liturgy/services/liturgy-music-search";

const FUZZY_EDIT_DISTANCE = 1;

/** Cada palavra da query casa (substring ou fuzzy) com alguma palavra do alvo. */
function queryTokensMatch(targetTokens: string[], queryToken: string): boolean {
	return targetTokens.some(
		(t) => t.includes(queryToken) || levenshteinWithin(t, queryToken, FUZZY_EDIT_DISTANCE),
	);
}

/**
 * Match difuso de query em texto (título ou autor). Vazio/whitespace →
 * true (sem filtro). Acentos/pontuação normalizados dos dois lados.
 */
export function fuzzyMatch(query: string, ...fields: (string | null | undefined)[]): boolean {
	const q = normalizeSearchText(query);
	if (!q) return true;
	const qTokens = q.split(" ");
	const targetTokens = fields
		.map((f) => normalizeSearchText(f ?? ""))
		.flatMap((t) => (t ? t.split(" ") : []));
	return qTokens.every((qt) => queryTokensMatch(targetTokens, qt));
}
