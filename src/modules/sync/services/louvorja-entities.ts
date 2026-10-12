/**
 * Entidades `mediaCustomCatalog` e `preferences` do pacote `.louvorja`
 * (schema 1 — extensão forward-compatible, decisão do card t_c1ea317a).
 *
 * - `mediaCustomCatalog.data.db` = o LocalDb do local-custom-store
 *   (collections + musics + contadores de id negativos). Sem áudio base64
 *   nem paths no pacote: binário/paths são por-máquina — offline-first
 *   nunca perde dados, o import substitui SÓ esta entidade.
 * - `preferences.data` = chaves de allowlist explícita
 *   (`stage.settings.<scope>`), nunca blob opaco. LWW por chave-grupo.
 */

import {
	loadLocalDb,
	listLocalCollections,
	type LocalDb,
	type LocalMusic,
} from "@modules/media/services/local-custom-store";
import { loadStageSettingsOptionalRaw } from "@modules/settings/services/stage-settings-preferences";

export const MEDIA_CUSTOM_CATALOG_ENTITY = "mediaCustomCatalog";
export const PREFERENCES_ENTITY = "preferences";

/** Escopos de palco sincronizáveis (paridade com StageSettingsRepository). */
export const STAGE_SCOPES = [
	"global",
	"hymns",
	"bible",
	"liturgy",
	"timer",
] as const;

export type StageScopeName = (typeof STAGE_SCOPES)[number];

/** Prefixo canônico das chaves de preferência sincronizáveis. */
export const SYNCABLE_PREFERENCE_PREFIX = "stage.settings.";

export function isSyncablePreferenceKey(key: string): boolean {
	if (!key.startsWith(SYNCABLE_PREFERENCE_PREFIX)) return false;
	const scope = key.slice(SYNCABLE_PREFERENCE_PREFIX.length);
	return (STAGE_SCOPES as readonly string[]).includes(scope);
}

/** Extrai o LocalDb atual (somente dados estruturados, sem binários). */
export function exportMediaCustomCatalogDb(): LocalDb {
	const db = loadLocalDb();
	return {
		...db,
		// Segurança em profundidade: nunca serialize bytes/paths no pacote.
		musics: db.musics.map((m) => ({
			...m,
			audioBase64: null,
			audioName: null,
		})),
	};
}

/** Monta `data` da entidade preferences a partir do storage local. */
export function exportPreferencesData(): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const scope of STAGE_SCOPES) {
		const raw = loadStageSettingsOptionalRaw(scope);
		if (raw != null) data[`${SYNCABLE_PREFERENCE_PREFIX}${scope}`] = raw;
	}
	return data;
}

/** Aplica `data` de preferences com allowlist — ignora chave fora da lista. */
export function applyPreferencesData(
	data: Record<string, unknown>,
	write: (key: string, value: unknown) => void,
): number {
	let applied = 0;
	for (const [key, value] of Object.entries(data)) {
		if (!isSyncablePreferenceKey(key)) continue;
		if (value == null || typeof value !== "object" || Array.isArray(value))
			continue;
		write(key, value);
		applied += 1;
	}
	return applied;
}

/**
 * Preserva binários locais que o pacote não carrega: áudio que já existia
 * no device com o MESMO id local não pode se perder no import
 * (offline-first — nada se perde).
 */
export function preserveLocalAudio(
	incoming: LocalDb,
	current: LocalDb,
): LocalDb {
	const localAudio = new Map<string, LocalMusic>();
	for (const m of current.musics) {
		if (m.audioBase64 != null || m.audioName != null) {
			localAudio.set(`${m.id}:${m.collectionId}`, m);
		}
	}
	return {
		...incoming,
		musics: incoming.musics.map((m) => {
			const prev = localAudio.get(`${m.id}:${m.collectionId}`);
			if (!prev) return m;
			return {
				...m,
				audioBase64: m.audioBase64 ?? prev.audioBase64,
				audioName: m.audioName ?? prev.audioName,
			};
		}),
	};
}

/** Valida e normaliza `data` da entidade recebida; null = payload inválido. */
export function parseMediaCustomCatalogData(
	data: Record<string, unknown>,
): LocalDb | null {
	const db = data.db;
	if (db == null || typeof db !== "object" || Array.isArray(db)) return null;
	const parsed = db as Partial<LocalDb>;
	if (!Array.isArray(parsed.collections) || !Array.isArray(parsed.musics)) {
		return null;
	}
	return {
		nextCollectionId:
			typeof parsed.nextCollectionId === "number"
				? parsed.nextCollectionId
				: -1,
		nextMusicId:
			typeof parsed.nextMusicId === "number" ? parsed.nextMusicId : -1,
		nextLyricId:
			typeof parsed.nextLyricId === "number" ? parsed.nextLyricId : -1,
		collections: parsed.collections,
		musics: parsed.musics,
	};
}

/** Lista ids de coletâneas locais existentes (uso em testes/round-trip). */
export function localCollectionIds(): number[] {
	return listLocalCollections().map((c) => c.id);
}
