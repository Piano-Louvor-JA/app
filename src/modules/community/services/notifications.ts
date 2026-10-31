/**
 * Notificações (F6) — cliente da API.
 * Lista não lidas + marcar todas como lidas.
 */

import { getAuthSession, saveSession } from "@modules/media/services/auth-client";
import { communityBaseUrl, communityRequest } from "./community-http";

export type AppNotification = {
	id: number;
	type: string;
	title: string;
	body: string;
	created_at: string;
};

function token(): string | null {
	return getAuthSession()?.token ?? null;
}

/** Notificações não lidas. Sem sessão/falha → lista vazia (nunca lança). */
export async function getNotifications(): Promise<AppNotification[]> {
	const t = token();
	if (!t) return [];
	try {
		const response = await fetch(
			`${communityBaseUrl()}/notifications`,
			communityRequest({ headers: { Authorization: `Bearer ${t}` } }),
		);
		if (response.status === 401) {
			// Token salvo rejeitado pela API (placeholder de fallback ou sessão
			// expirada) — limpa pra forçar re-login em vez de 401 em silêncio.
			saveSession(null);
			return [];
		}
		if (!response.ok) return [];
		const json = (await response.json()) as { data?: unknown };
		return Array.isArray(json.data)
			? (json.data as AppNotification[])
			: [];
	} catch {
		return [];
	}
}

/** Marca todas como lidas. */
export async function markAllRead(): Promise<void> {
	const t = token();
	if (!t) return;
	try {
		await fetch(
			`${communityBaseUrl()}/notifications/read-all`,
			communityRequest({
				method: "POST",
				headers: { Authorization: `Bearer ${t}` },
			}),
		);
	} catch {
		// best-effort
	}
}
