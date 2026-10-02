/**
 * Notificações (F6) — cliente da API.
 * Lista não lidas + marcar todas como lidas.
 */

import { getAuthSession } from "@modules/media/services/auth-client";

export type AppNotification = {
	id: number;
	type: string;
	title: string;
	body: string;
	created_at: string;
};

function communityBaseUrl(): string {
	const base =
		import.meta.env.VITE_PALCO_API_URL ?? "https://api.pianolouvorja.com.br";
	return `${base.replace(/\/$/, "")}/v1/custom`;
}

function token(): string | null {
	return getAuthSession()?.token ?? null;
}

/** Notificações não lidas. Sem sessão/falha → lista vazia (nunca lança). */
export async function getNotifications(): Promise<AppNotification[]> {
	const t = token();
	if (!t) return [];
	try {
		const response = await fetch(`${communityBaseUrl()}/notifications`, {
			headers: { Authorization: `Bearer ${t}` },
		});
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
		await fetch(`${communityBaseUrl()}/notifications/read-all`, {
			method: "POST",
			headers: { Authorization: `Bearer ${t}` },
		});
	} catch {
		// best-effort
	}
}
