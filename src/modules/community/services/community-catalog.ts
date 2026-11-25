import {
	createLocalCollection,
	createLocalMusic,
	listLocalCollections,
} from "@modules/media/services/local-custom-store";
import { communityBaseUrl, communityRequest } from "./community-http";

/**
 * Catálogo da Comunidade — coletâneas PÚBLICAS (read-only).
 * F0 do Ranking/Gamificação (SPEC validada 16/09).
 *
 * A listagem pública vem do GET /v1/custom/collections SEM sessão:
 * a API já filtra `visibility='public'` para requisições anônimas
 * (custom.routes.ts). Este serviço NUNCA envia credenciais e NUNCA
 * expõe email — só author_name.
 */

export type CommunityCollectionSummary = {
	id: number;
	name: string;
	description: string | null;
	coverUrl: string | null;
	authorName: string | null;
	musicsCount: number;
	updatedAt: string | null;
	/** Dono (RF-04): habilita ações inline quando === id_user da sessão. */
	ownerId?: number | null;
	/** Privacidade (RF-04): ausente/legado = público (default da API). */
	visibility?: "public" | "private";
};

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** Ordena por updated_at DESC (mais recentes primeiro); null vai pro fim. */
export function sortByRecentFirst(
	collections: CommunityCollectionSummary[],
): CommunityCollectionSummary[] {
	return [...collections].sort((a, b) => {
		const ta = a.updatedAt ? Date.parse(a.updatedAt.replace(" ", "T")) : 0;
		const tb = b.updatedAt ? Date.parse(b.updatedAt.replace(" ", "T")) : 0;
		return tb - ta;
	});
}

/**
 * Salva uma cópia LOCAL e editável de uma coletânea da comunidade (F0.4).
 * Cria coletânea local (ids negativos, só desta máquina) com as faixas da
 * original (nome + link p/ hino oficial quando houver). NUNCA escreve na
 * coletânea do autor — a original é apenas lida.
 * Retorna o id local da cópia ou null se falhar.
 */
export async function saveCommunityCopy(
	collection: CommunityCollectionSummary,
): Promise<number | null> {
	try {
		const response = await fetch(
			`${communityBaseUrl()}/collections/${collection.id}/musics`,
			communityRequest(),
		);
		if (!response.ok) return null;
		const json = (await response.json()) as { data?: unknown };
		const musics = (json.data as Array<Record<string, unknown>>).map(
			(row) => ({
				name: asString(row.name) ?? "",
				officialMusicId:
					typeof row.official_music_id === "number" &&
					row.official_music_id > 0
						? row.official_music_id
						: null,
			}),
		);
		const copy = createLocalCollection(
			collection.name,
			collection.description ?? undefined,
			// D1/RF-2 (SPEC louvorja-community-copies): marca a origem —
			// cópia vive EXCLUSIVAMENTE na aba Comunidade, nunca em /albums.
			{
				type: "community",
				collectionId: collection.id,
				copiedAt: new Date().toISOString(),
			},
		);
		for (const music of musics) {
			createLocalMusic(copy.id, {
				name: music.name,
				officialMusicId: music.officialMusicId ?? undefined,
			});
		}
		return copy.id;
	} catch {
		return null;
	}
}

/**
 * D2 (SPEC louvorja-community-copies v1.0.0): ids locais de cópias da
 * Comunidade (origin.type='community') — NÃO aparecem na Central de Mídia.
 */
export function listCommunityCopyIds(): Set<number> {
	return new Set(
		listLocalCollections()
			.filter((c) => c.origin?.type === "community")
			.map((c) => c.id),
	);
}

/**
 * Lista coletâneas públicas da comunidade.
 * Requisição deliberadamente ANÔNIMA (usuário deslogado também vê — B7).
 * Qualquer falha → lista vazia (nunca lança).
 */
export type CommunityPage = {
	items: CommunityCollectionSummary[];
	page: number;
	lastPage: number;
	total: number;
};

export async function listCommunityCollectionsPage(
	page: number,
	perPage = 24,
): Promise<CommunityPage> {
	const empty: CommunityPage = { items: [], page, lastPage: 1, total: 0 };
	try {
		const response = await fetch(
			`${communityBaseUrl()}/collections?page=${page}&per_page=${perPage}`,
			communityRequest(),
		);
		if (!response.ok) return empty;
		const json = (await response.json()) as {
			data?: unknown;
			meta?: { total?: number; page?: number; last_page?: number };
		};
		const rows = json.data as Array<Record<string, unknown>>;
		const meta = {
			page: Number(json.meta?.page ?? page),
			last_page: Number(json.meta?.last_page ?? 1),
			total: Number(json.meta?.total ?? 0),
		};

		const collections = rows.map((row) => ({
			id: Number(row.id_collection),
			name: asString(row.name) ?? "",
			description: asString(row.description),
			coverUrl: asString(row.cover_url),
			authorName: asString(row.author_name),
			musicsCount: Number.isFinite(Number(row.musics_count))
				? Number(row.musics_count)
				: 0,
			updatedAt: asString(row.updated_at),
			ownerId: Number.isInteger(row.owner_id) && Number(row.owner_id) > 0
				? Number(row.owner_id)
				: null,
			visibility: (row.visibility === "private" ? "private" : "public") as
				| "public"
				| "private",
		}));

		return {
			items: sortByRecentFirst(collections),
			page: meta.page,
			lastPage: meta.last_page,
			total: meta.total,
		};
	} catch {
		return empty;
	}
}

/**
 * Detalhe público de uma coletânea da Comunidade (RF-01/RF-02, SPEC
 * comunidade-acesso-copia v1.0.0): nome/autor + faixas com flag de
 * reprodução. Consome APENAS endpoints públicos já existentes
 * (GET /collections/{id} + GET /collections/{id}/musics) — a API já
 * responde 404 uniforme para privada de terceiro/inexistente.
 * Qualquer falha (rede, HTTP, JSON quebrado) → null; nunca lança.
 */
export type CommunityCollectionTrack = {
	id: number;
	name: string;
	audioUrl: string | null;
	officialMusicId: number | null;
	/** RF-02: indisponibilidade explícita — false = sem o que tocar. */
	hasAudio: boolean;
};

export type CommunityCollectionDetail = {
	id: number;
	name: string;
	description: string | null;
	authorName: string | null;
	coverUrl: string | null;
	musics: CommunityCollectionTrack[];
};

function asPositiveInt(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: null;
}

export async function getCommunityCollectionDetail(
	collectionId: number,
): Promise<CommunityCollectionDetail | null> {
	if (!(collectionId > 0)) return null;
	try {
		const [collectionResponse, musicsResponse] = await Promise.all([
			fetch(`${communityBaseUrl()}/collections/${collectionId}`, communityRequest()),
			fetch(
				`${communityBaseUrl()}/collections/${collectionId}/musics`,
				communityRequest(),
			),
		]);
		if (!collectionResponse.ok || !musicsResponse.ok) return null;
		const collection = (await collectionResponse.json()) as Record<
			string,
			unknown
		>;
		const id = asPositiveInt(collection.id_collection);
		if (id === null) return null;
		const musicsJson = (await musicsResponse.json()) as {
			data?: unknown;
		};
		const rows = Array.isArray(musicsJson.data)
			? (musicsJson.data as Array<Record<string, unknown>>)
			: [];
		const musics = rows.map((row) => {
			const officialMusicId = asPositiveInt(row.official_music_id);
			const audioUrl = asString(row.audio_url);
			return {
				id: asPositiveInt(row.id_music) ?? 0,
				name: asString(row.name) ?? "",
				audioUrl,
				officialMusicId,
				hasAudio: audioUrl !== null || officialMusicId !== null,
			};
		});
		return {
			id,
			name: asString(collection.name) ?? "",
			description: asString(collection.description),
			authorName: asString(collection.author_name),
			coverUrl: asString(collection.cover_url),
			musics,
		};
	} catch {
		return null;
	}
}
