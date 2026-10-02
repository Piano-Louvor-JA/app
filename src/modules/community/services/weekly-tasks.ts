/**
 * Tarefas semanais (F4) — cliente da API.
 * Reset semanal pelo week_key da API (domingo 00:00 UTC-3 na SPEC).
 * Bônus: +15 por tarefa, 1x por usuário×tarefa×semana (idempotente no servidor).
 */

import { getAuthSession } from "@modules/media/services/auth-client";

export type WeeklyTask = {
	id: string;
	description: string;
	done: boolean;
	bonus: number;
};

function communityBaseUrl(): string {
	const base =
		import.meta.env.VITE_PALCO_API_URL ?? "https://api.pianolouvorja.com.br";
	return `${base.replace(/\/$/, "")}/v1/custom`;
}

function token(): string | null {
	return getAuthSession()?.token ?? null;
}

/** Tarefas da semana do usuário. Sem sessão/falha → null. */
export async function getWeeklyTasks(): Promise<WeeklyTask[] | null> {
	const t = token();
	if (!t) return null;
	try {
		const response = await fetch(`${communityBaseUrl()}/weekly-tasks`, {
			headers: { Authorization: `Bearer ${t}` },
		});
		if (!response.ok) return null;
		const json = (await response.json()) as { data?: unknown };
		return Array.isArray(json.data) ? (json.data as WeeklyTask[]) : null;
	} catch {
		return null;
	}
}

/** Marca tarefa como concluída. Retorna true se o bônus foi creditado agora. */
export async function completeWeeklyTask(taskId: string): Promise<boolean> {
	const t = token();
	if (!t) return false;
	try {
		const response = await fetch(
			`${communityBaseUrl()}/weekly-tasks/${taskId}/complete`,
			{ method: "POST", headers: { Authorization: `Bearer ${t}` } },
		);
		if (!response.ok) return false;
		const json = (await response.json()) as { credited?: boolean };
		return json.credited === true;
	} catch {
		return false;
	}
}
