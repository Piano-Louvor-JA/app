/**
 * Ranking & Gamificação (F2) — cliente da API.
 *
 * Ranking GLOBAL (decisão #3), janelas week|all. Display name nunca email (B8).
 * registerUse exige sessão: uso 1x/user×collection é credita +5 ao DONO (F1).
 */

export type RankingEntry = {
	position: number;
	user_id: number;
	display_name: string | null;
	total: number;
};

export type MyPosition = { position: number | null; total: number | null };

export type RankingWindow = "week" | "all";

function communityBaseUrl(): string {
	const base =
		import.meta.env.VITE_PALCO_API_URL ?? "https://api.pianolouvorja.com.br";
	return `${base.replace(/\/$/, "")}/v1/custom`;
}

export function authHeaders(sessionToken: string | null): Record<string, string> {
	return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}

/** Ranking global. Falha → lista vazia (nunca lança). */
export async function getRanking(
	window: RankingWindow,
): Promise<RankingEntry[]> {
	try {
		const response = await fetch(
			`${communityBaseUrl()}/ranking?window=${window}`,
		);
		if (!response.ok) return [];
		const json = (await response.json()) as { data?: unknown };
		if (!Array.isArray(json.data)) return [];
		return json.data as RankingEntry[];
	} catch {
		return [];
	}
}

/** Posição do usuário autenticado. Sem sessão/falha → null. */
export async function getMyPosition(
	window: RankingWindow,
	sessionToken: string | null,
): Promise<MyPosition | null> {
	if (!sessionToken) return null;
	try {
		const response = await fetch(
			`${communityBaseUrl()}/ranking/me?window=${window}`,
			{ headers: authHeaders(sessionToken) },
		);
		if (!response.ok) return null;
		return (await response.json()) as MyPosition;
	} catch {
		return null;
	}
}

/**
 * Registra uso de coletânea pública (F1). Exige sessão.
 * Retorna true se foi o primeiro uso deste usuário nesta coletânea.
 */
export async function registerUse(
	collectionId: number,
	sessionToken: string | null,
): Promise<boolean> {
	if (!sessionToken) return false;
	try {
		const response = await fetch(
			`${communityBaseUrl()}/collections/${collectionId}/use`,
			{
				method: "POST",
				headers: authHeaders(sessionToken),
			},
		);
		if (!response.ok) return false;
		const json = (await response.json()) as { first_use?: boolean };
		return json.first_use === true;
	} catch {
		return false;
	}
}

/**
 * F5: reporta coletânea (esconde do catálogo público até revisão da curadoria).
 * Exige sessão. Retorna true se o report foi registrado.
 */
export async function reportCollection(
	collectionId: number,
	reason: string,
	sessionToken: string | null,
): Promise<boolean> {
	if (!sessionToken) return false;
	try {
		const response = await fetch(
			`${communityBaseUrl()}/collections/${collectionId}/report`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					...authHeaders(sessionToken),
				},
				body: JSON.stringify({ reason }),
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}
