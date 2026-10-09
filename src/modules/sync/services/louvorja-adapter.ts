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
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
	getUserPreference,
	setUserPreference,
} from "@shared/services/user-preferences";

import {
	LOUVORJA_SCHEMA_VERSION,
	type LouvorjaSyncPackage,
} from "./louvorja-package";
import {
	loadLocalDb,
	replaceLocalDb,
} from "@modules/media/services/local-custom-store";
import {
	MEDIA_CUSTOM_CATALOG_ENTITY,
	PREFERENCES_ENTITY,
	applyPreferencesData,
	exportMediaCustomCatalogDb,
	exportPreferencesData,
	parseMediaCustomCatalogData,
	preserveLocalAudio,
} from "./louvorja-entities";

/** Mesmo prefixo do APK (`sync_timestamps.dart`). */
export const SYNC_MODIFIED_PREFIX = "sync.modified.v1";

export type LouvorjaImportResult = {
	applied: string[];
	skipped: string[];
};

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
			const items = (liturgyState.weekdays?.[day] ?? []).map((item) => {
				if (
					item.type === "music" &&
					typeof item.musicId === "number" &&
					item.musicId < 0
				) {
					return { ...item, musicId: null };
				}
				return item;
			});
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

	// Coletâneas custom locais (Minhas Coletâneas modo sem-auth).
	const customDb = exportMediaCustomCatalogDb();
	if (customDb.collections.length > 0 || customDb.musics.length > 0) {
		entities[MEDIA_CUSTOM_CATALOG_ENTITY] = {
			type: MEDIA_CUSTOM_CATALOG_ENTITY,
			modified: readModified(MEDIA_CUSTOM_CATALOG_ENTITY),
			data: { db: customDb },
		};
	}

	// Preferências de palco/letra (allowlist — nunca blob opaco).
	const prefData = exportPreferencesData();
	if (Object.keys(prefData).length > 0) {
		entities[PREFERENCES_ENTITY] = {
			type: PREFERENCES_ENTITY,
			modified: readModified(PREFERENCES_ENTITY),
			data: prefData,
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
			case MEDIA_CUSTOM_CATALOG_ENTITY: {
				const localTs = readModified(MEDIA_CUSTOM_CATALOG_ENTITY);
				if (toEpoch(entity.modified) > toEpoch(localTs)) {
					const next = parseMediaCustomCatalogData(entity.data);
					if (next == null) {
						skipped.push(MEDIA_CUSTOM_CATALOG_ENTITY);
						break;
					}
					// Substituição total SÓ desta entidade (offline-first:
					// liturgia/preferências não são tocados; áudio local existente
					// com o mesmo id é preservado).
					const merged = preserveLocalAudio(
						next,
						loadLocalDb(),
					);
					if (replaceLocalDb(merged)) {
						localStorage.setItem(
							`${SYNC_MODIFIED_PREFIX}.${MEDIA_CUSTOM_CATALOG_ENTITY}`,
							entity.modified,
						);
						applied.push(MEDIA_CUSTOM_CATALOG_ENTITY);
					} else {
						skipped.push(MEDIA_CUSTOM_CATALOG_ENTITY);
					}
				} else {
					skipped.push(MEDIA_CUSTOM_CATALOG_ENTITY);
				}
				break;
			}
			case PREFERENCES_ENTITY: {
				const localTs = readModified(PREFERENCES_ENTITY);
				if (toEpoch(entity.modified) > toEpoch(localTs)) {
					const count = applyPreferencesData(
						entity.data,
						(key, value) => setUserPreference(key, value),
					);
					if (count > 0) {
						localStorage.setItem(
							`${SYNC_MODIFIED_PREFIX}.${PREFERENCES_ENTITY}`,
							entity.modified,
						);
						applied.push(PREFERENCES_ENTITY);
					} else {
						skipped.push(PREFERENCES_ENTITY);
					}
				} else {
					skipped.push(PREFERENCES_ENTITY);
				}
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
		/* v8 ignore next 1 -- storage indisponivel so ocorre fora de browser (testes cobrem via spy) */
		return "";
	}
}
