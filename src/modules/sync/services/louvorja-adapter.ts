/**
 * Adaptador browser (web + Electron renderer) ↔ pacote `.louvorja`.
 *
 * Espelha `sync_adapter.dart` do APK:
 * - Export: lê `liturgy.state` (user preferences) → entidade `liturgy`.
 * - Import: LWW por entidade contra `sync.modified.v1.<entity>` (localStorage).
 * - Timestamp do IMPORT = `modified` do PACOTE (relógios distintos não
 *   podem corromper a ordem LWW).
 * - Entidade desconhecida é ignorada silenciosamente (forward-compatible).
 *
 * Formato da entidade `liturgy` no pacote (schema 1 — definido pelo APK):
 * `data.state` = LiturgyPersistedState completo do módulo liturgy
 * (weekdays, dayNotes, daySessionTimes, customLiturgies, deletionLocks).
 */

import {
	LITURGY_WEEKDAYS,
	type LiturgyPersistedState,
	type LiturgyWeekday,
} from "@modules/liturgy/types/liturgy";
import type {
	ScheduledCategory,
	ScheduledItem,
} from "@modules/liturgy/stores/useScheduledStore";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
	getUserPreference,
	setUserPreference,
} from "@shared/services/user-preferences";

import {
	LOUVORJA_SCHEMA_VERSION,
	type LouvorjaSyncPackage,
} from "./louvorja-package";

/** Mesmo prefixo do APK (`sync_timestamps.dart`). */
export const SYNC_MODIFIED_PREFIX = "sync.modified.v1";

export type LouvorjaImportResult = {
	applied: string[];
	skipped: string[];
};

type ScheduledState = {
	categories: ScheduledCategory[];
	items: ScheduledItem[];
};

function isScheduledState(data: Record<string, unknown>): data is ScheduledState {
	if (!Array.isArray(data.categories) || !Array.isArray(data.items)) return false;
	const categories = data.categories.filter(
		(value): value is ScheduledCategory =>
			value != null &&
			typeof value === "object" &&
			typeof (value as Record<string, unknown>).id === "string" &&
			typeof (value as Record<string, unknown>).name === "string",
	);
	const categoryIds = new Set(categories.map((category) => category.id));
	const items = data.items.filter(
		(value): value is ScheduledItem => {
			if (value == null || typeof value !== "object") return false;
			const item = value as Record<string, unknown>;
			if (
				typeof item.id !== "string" ||
				typeof item.categoryId !== "string" ||
				!categoryIds.has(item.categoryId) ||
				!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) ||
				typeof item.name !== "string" ||
				typeof item.filePath !== "string" ||
				typeof item.isRelativePath !== "boolean" ||
				typeof item.notes !== "string"
			) return false;
			if (item.content == null) return true;
			if (typeof item.content !== "object") return false;
			return ["music", "file", "verse", "annotation", "online_video"].includes(
				String((item.content as Record<string, unknown>).kind),
			);
		},
	);
	(data as ScheduledState).categories = categories;
	(data as ScheduledState).items = items;
	return true;
}

export function exportLouvorjaFromBrowser(
	appVersion: string,
	platform: string,
): LouvorjaSyncPackage {
	const entities: LouvorjaSyncPackage["entities"] = {};

	const liturgyState = getUserPreference<LiturgyPersistedState>(
		USER_PREFERENCE_KEYS.liturgyState,
		null,
	);
	if (liturgyState != null) {
		// Schema 1 do APK: data = { monday: { items, notes }, ... }.
		// Não exporta state do renderer: isso quebraria a ponta Flutter.
		const days: Record<string, unknown> = {};
		for (const day of LITURGY_WEEKDAYS) {
			const items = liturgyState.weekdays?.[day] ?? [];
			const notes = liturgyState.dayNotes?.[day] ?? "";
			if (items.length > 0 || notes.length > 0) days[day] = { items, notes };
		}
		if (Object.keys(days).length > 0) {
			entities.liturgy = {
				type: "liturgy",
				modified: readModified("liturgy"),
				data: days,
			};
		}
	}

	const scheduled = getUserPreference<ScheduledState>(
		USER_PREFERENCE_KEYS.scheduledState,
		null,
	);
	if (scheduled != null && (scheduled.categories.length > 0 || scheduled.items.length > 0)) {
		entities.scheduled = {
			type: "scheduled",
			modified: readModified("scheduled"),
			data: scheduled,
		};
	}

	return {
		schema: LOUVORJA_SCHEMA_VERSION,
		appVersion,
		platform,
		exportedAt: new Date().toISOString(),
		entities,
	};
}

export function importLouvorjaIntoBrowser(
	pkg: LouvorjaSyncPackage,
): LouvorjaImportResult {
	const applied: string[] = [];
	const skipped: string[] = [];

	for (const [name, entity] of Object.entries(pkg.entities)) {
		switch (name) {
			case "liturgy": {
				const localTs = readModified("liturgy");
				const remoteEpoch = toEpoch(entity.modified);
				if (remoteEpoch > toEpoch(localTs)) {
					const current = getUserPreference<LiturgyPersistedState>(
						USER_PREFERENCE_KEYS.liturgyState,
						null,
					);
					if (current == null) {
						skipped.push("liturgy");
						break;
					}
					// Não elimina custom liturgies, horários de sessão ou locks que o
					// schema mobile ainda não representa. Só substitui os dias recebidos.
					const next = structuredClone(current);
					let hasDay = false;
					for (const day of LITURGY_WEEKDAYS) {
						const payload = entity.data[day];
						if (payload == null || typeof payload !== "object") continue;
						const source = payload as Record<string, unknown>;
						if (Array.isArray(source.items))
							next.weekdays[day] =
								source.items as LiturgyPersistedState["weekdays"][LiturgyWeekday];
						if (typeof source.notes === "string")
							next.dayNotes[day] = source.notes;
						hasDay = true;
					}
					if (hasDay) {
						setUserPreference(USER_PREFERENCE_KEYS.liturgyState, next);
						localStorage.setItem(
							`${SYNC_MODIFIED_PREFIX}.liturgy`,
							entity.modified,
						);
						applied.push("liturgy");
					} else {
						skipped.push("liturgy");
					}
				} else {
					skipped.push("liturgy");
				}
				break;
				}
				case "scheduled": {
				if (toEpoch(entity.modified) <= toEpoch(readModified("scheduled"))) {
					skipped.push("scheduled");
					break;
				}
				if (!isScheduledState(entity.data)) {
					skipped.push("scheduled");
					break;
				}
				setUserPreference(USER_PREFERENCE_KEYS.scheduledState, entity.data);
				localStorage.setItem(
					`${SYNC_MODIFIED_PREFIX}.scheduled`,
					entity.modified,
				);
				applied.push("scheduled");
				break;
				}
				default:
				// Entidade ainda não suportada nesta ponta — preservada no pacote,
				// ignorada na aplicação (forward-compatible).
				break;
		}
	}

	return { applied, skipped };
}

function toEpoch(iso: string): number {
	const value = Date.parse(iso);
	return Number.isFinite(value) ? value : 0;
}

function readModified(entity: string): string {
	try {
		return localStorage.getItem(`${SYNC_MODIFIED_PREFIX}.${entity}`) ?? "";
	} catch {
		return "";
	}
}
