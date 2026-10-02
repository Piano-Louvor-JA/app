/**
 * F6 — Evento sazonal ativo (banner público na Comunidade).
 * Endpoint público: GET /v1/custom/seasonal-event.
 */

export type SeasonalEventBanner = {
	active: true;
	name: string;
	description?: string;
	multiplier: number;
};

type SeasonalEventResponse =
	| ({ active: false } & Record<string, unknown>)
	| ({ active: true } & SeasonalEventBanner);

function communityBaseUrl(): string {
	const base =
		import.meta.env.VITE_PALCO_API_URL ?? "https://api.pianolouvorja.com.br";
	return `${base.replace(/\/$/, "")}/v1/custom`;
}

/** Evento sazonal ativo (banner). Sem evento/falha → null. */
export async function getSeasonalEvent(): Promise<SeasonalEventBanner | null> {
	try {
		const response = await fetch(`${communityBaseUrl()}/seasonal-event`);
		if (!response.ok) return null;
		const json = (await response.json()) as SeasonalEventResponse;
		if (json.active !== true) return null;
		return {
			active: true,
			name: json.name,
			description: json.description,
			multiplier: json.multiplier,
		};
	} catch {
		return null;
	}
}
