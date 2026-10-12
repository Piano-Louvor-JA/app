/**
 * app#331: importa um arquivo .slja e o transforma em música CUSTOM pronta
 * pra virar item de liturgia — o serviço devolve o id JÁ no namespace de
 * exibição (displayMusicId) que resolveMediaTrack()/player resolvem:
 * - deslogado → grava 100% LOCAL (localStorage, id negativo, áudio base64
 *   data:) e exibe via offset 1M+ — offline-first: nada depende de rede;
 * - logado → sobe pra API (coletânea "Importações .slja") e exibe via
 *   offset 1M+ (mesmo namespace de Minhas Coletâneas).
 *
 * Reusa EXATAMENTE o pipeline do media editor (MediaEditorView.onImportFile):
 * parse → coletânea → música → mídia → estrofes. Falha de upload de mídia
 * NÃO aborta o import (segue só com texto) — mesma semântica do editor.
 * Slides CAPA não viram estrofe (o player projeta a capa automática).
 */

import { getAuthSession } from "@modules/media/services/auth-client";
import {
	createCustomCollection,
	createCustomLyric,
	createCustomMusic,
	deleteCustomMusic,
	listCustomCollections,
	toCustomMusicId,
	updateCustomMusic,
	uploadCustomFile,
} from "@modules/media/services/custom-catalog";
import { parseSljaFile } from "@shared/services/slja";
import { sha256Hex } from "@shared/services/content-hash";

export interface ImportedSljaLiturgyMusic {
	/**
	 * Id da música custom (sem offset): negativo = local (localStorage),
	 * positivo = API. Persiste no LiturgyItemDraft.musicId — o player
	 * resolve os dois namespaces.
	 */
	musicId: number;
	/**
	 * Id p/ EXIBIÇÃO/ligação no catálogo da liturgia: o MESMO que o player
	 * resolve. Custom API → offset 1M+ (namespace de Minhas Coletâneas);
	 * local NEGATIVO → cru (offsetar corromperia o namespace — cairia no
	 * intervalo morto 999.99x entre oficiais e o offset 1M+).
	 */
	displayMusicId: number;
	name: string;
	collectionId: number | null;
	slides: number;
	hasAudio: boolean;
	uploadedImages: number;
	/** Duração estimada (ms): último tempo_hms + margem. 0 = desconhecida. */
	durationMs: number;
	/** true = gravado só local (sem login); sync pra conta é versão futura. */
	local: boolean;
	/** SHA-256 do arquivo de origem — dedupe de re-import. */
	sljaHash: string;
	/** true = arquivo já importado antes; a música existente foi ATUALIZADA. */
	updatedExisting: boolean;
	/** Imagens do .slja não cabem no armazenamento local e foram omitidas. */
	imagesOmitted: boolean;
}

/** Margem além do último slide (o MP3 real pode esticar). */
const DURATION_MARGIN_MS = 30_000;
const IMPORT_COLLECTION_NAME = "Importações .slja";

/** ms → HH:MM:SS SEMPRE 3 partes ("00:17" viraria 17 MINUTOS no player). */
export function formatSljaMsAsTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
	const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
	const s = String(totalSeconds % 60).padStart(2, "0");
	return `${h}:${m}:${s}`;
}

/**
 * Duração estimada do item: último tempo_hms + margem (0 quando o .slja
 * não tem timing — item fica com a duração que o operador digitar).
 */
export function estimateSljaDurationMs(
	slides: Array<{ timeMs: number }>,
): number {
	const lastTimeMs = slides.reduce((max, s) => Math.max(max, s.timeMs), 0);
	return lastTimeMs > 0 ? lastTimeMs + DURATION_MARGIN_MS : 0;
}

/**
 * Nome da música: título do .slja, ignorando fallbacks genéricos do parser
 * (`v<versao>` / vazio) — nesses casos usa o nome do arquivo/innerName.
 * Mesma regra do media editor.
 */
export function sljaDisplayName(
	archive: { title?: string },
	fallback: string,
): string {
	const title = archive.title?.trim() ?? "";
	const generic =
		/^v[\d.]+$/.test(title) || title.length === 0 || title === "Sem título";
	if (generic) {
		return fallback
			.replace(/\.slja(\.zip)?$/i, "")
			.replace(/\.zip$/i, "")
			.trim();
	}
	return title;
}


/** hex sha256 → formato uuid (determinístico; não precisa ser RFC v5 canônico,
 *  só estável pro mesmo conteúdo). */
async function sha256ToUuid(hex: string): Promise<string> {
	const h = hex.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
	return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join("-");
}

async function ensureImportCollectionId(): Promise<number | null> {
	// Reaproveita a primeira "Importações .slja" existente (mesma regra do
	// media editor); só cria se ainda não houver nenhuma.
	try {
		const signal = AbortSignal.timeout(15_000);
		const collections = await listCustomCollections({ signal });
		if (signal.aborted) return null;
		const ownerId = getAuthSession()?.user?.id_user;
		// Id negativo é coletânea LOCAL. Coletânea pública de outro usuário
		// com o mesmo nome também não serve: o POST seguinte seria recusado.
		const existing = collections.find(
			(c) =>
				c.name === IMPORT_COLLECTION_NAME &&
				c.id > 0 &&
				ownerId != null &&
				c.ownerId === ownerId,
		);
		if (existing) return existing.id;
	} catch {
		// catálogo indisponível — tenta criar mesmo assim
	}
	const created = await createCustomCollection(
		IMPORT_COLLECTION_NAME,
		undefined,
		undefined,
		"private",
		{ queueOffline: false },
	);
	if (created == null || created.id <= 0) return null;
	return created.id;
}

/** Entrada mínima que o dialog tem em mão (File do input atende). */
export interface SljaImportSource {
	bytes: ArrayBuffer;
	name: string;
}

export interface SljaImportOptions {
	/**
	 * Aprovação do usuário pra subir pra conta. Quando o callback existe,
	 * recusar grava só no aparelho. Sem callback, login segue o envio.
	 */
	confirmUpload?: () => Promise<boolean>;
}

export async function importSljaAsLiturgyMusic(
	source: SljaImportSource,
	options?: SljaImportOptions,
): Promise<ImportedSljaLiturgyMusic> {
	const { bytes, name: fileName } = source;
	// Aceita .slja direto OU .slja.zip (wrapper do WhatsApp) — parser pronto.
	const archive = await parseSljaFile(bytes, fileName);
	// Identidade de conteúdo: re-import do mesmo arquivo atualiza em vez de
	// duplicar (feedback Ezequias/Rafael: "itens importados não deveriam
	// duplicar").
	const sljaHash = await sha256Hex(new Uint8Array(bytes));
	const innerName = (archive as { innerName?: string }).innerName;

	const name = sljaDisplayName(archive, innerName ?? fileName);

	const coverImageName = archive.slides.find((slide) => slide.type === "CAPA")
		?.image?.name;
	const slides = [...archive.slides]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.filter((slide) => slide.type !== "CAPA" && slide.lyric.trim().length > 0);

	const durationMs = estimateSljaDurationMs(slides);
	if (slides.length === 0) {
		throw new Error("SLJA_IMPORT_NO_LYRICS");
	}

	// ── Deslogado: grava 100% LOCAL (regra de produto 12/09 — sem identidade
	// não há escrita confiável na API). Uso local sem conta é requisito
	// permanente (offline-first): áudio/estrofes ficam no localStorage.
	// Regra de produto (Rafael 03/10): o disco local pode ter quantas
	// cópias o usuário quiser (tanto faz); pro BANCO o arquivo sobe UM
	// (dedup) e SÓ após aprovação do usuário. Deslogado nem pergunta.
	const session = getAuthSession();
	if (!session) {
		return importSljaLocal({
			name,
			archive,
			slides,
			durationMs,
			sljaHash,
			coverImageName,
		});
	}

	if (options?.confirmUpload) {
		const approved = await options.confirmUpload();
		if (!approved) {
			return importSljaLocal({
				name,
				archive,
				slides,
				durationMs,
				sljaHash,
				coverImageName,
			});
		}
	}

	// ── Logado: sobe pra API (Minhas Coletâneas → "Importações .slja").
	const collectionId = await ensureImportCollectionId();
	if (collectionId == null || collectionId <= 0) {
		throw new Error("SLJA_IMPORT_COLLECTION_FAILED");
	}

	// Dedup (app#336 fase 3): client_uuid determinístico do hash do arquivo —
	// re-import do MESMO .slja (ou import nos 2 dispositivos) vira no-op na
	// API (a rota retorna o registro existente) em vez de duplicar no banco.
	const clientUuid = await sha256ToUuid(sljaHash);
	const created = await createCustomMusic(collectionId, {
		name,
		client_uuid: clientUuid,
		...(durationMs > 0 ? { duration: durationMs / 1000 } : {}),
	});
	if (!created) {
		throw new Error("SLJA_IMPORT_MUSIC_FAILED");
	}
	const musicId = created.id;

	// Já existia (re-import): mídias já estão vinculadas — pular uploads.
	if (created.existed) {
		return {
			musicId,
			displayMusicId: toCustomMusicId(musicId),
			name,
			collectionId,
			slides: 0,
			hasAudio: false,
			uploadedImages: 0,
			durationMs: 0,
			local: false,
			sljaHash,
			updatedExisting: true,
			imagesOmitted: false,
		};
	}

	let uploadedImages = 0;
	const uploadedAssets: Array<{ path: string; url: string; idFile: number }> =
		[];
	// Upload do ÁUDIO em paralelo com as imagens (são independentes — o
	// link com o musicId vem depois via updateCustomMusic). Áudio é o
	// maior arquivo: não pode esperar a fila de imagens.
	const audioUpload: Promise<{ idFile: number } | null> | null =
		archive.audio?.bytes?.length
			? uploadCustomFile(
					archive.audio.bytes,
					archive.audio.name,
					"audio",
				)
			: null;

	if (archive.assets?.length) {
		// Uploads EM PARALELO (batch de 4): cada request à API custa ~0.7s de
		// RTT — em série, um .slja com 15 imagens levava 15×0.7s só de espera
		// ("o import deveria demorar? no web era rápido"). Ordem preservada
		// pelo map antes do all.
		const BATCH = 4;
		for (let i = 0; i < archive.assets.length; i += BATCH) {
			const batch = archive.assets.slice(i, i + BATCH);
			const results = await Promise.all(
				batch.map((asset) =>
					uploadCustomFile(asset.bytes, asset.path, "imagens").then(
						(up) => ({ asset, up }),
					),
				),
			);
			for (const { asset, up } of results) {
				if (up) {
					uploadedAssets.push({
						path: asset.path,
						url: up.url,
						idFile: up.idFile,
					});
					uploadedImages += 1;
				}
			}
		}
	}
	let hasAudio = false;
	if (audioUpload) {
		const uploadedAudio = await audioUpload;
		if (uploadedAudio) {
			const linked = await updateCustomMusic(musicId, {
				id_file_audio: uploadedAudio.idFile,
			});
			hasAudio = linked;
		}
	}

	const imageIdByUrl = new Map(uploadedAssets.map((a) => [a.url, a.idFile]));
	const coverAsset = matchUploadedAsset(coverImageName, uploadedAssets);
	if (coverAsset) {
		await updateCustomMusic(musicId, { id_file_image: coverAsset.idFile });
	}

	// Background da MÚSICA: o .slja clássico põe a imagem de fundo na CAPA
	// (Slide:1) e as estrofes herdam — mas a capa não vira estrofe no
	// import, então o bg precisa ser vinculado à custom_musics (é o que o
	// editor de letras usa como bg). Fallback: primeira imagem de estrofe.
	const coverMatchName =
		archive.slides.find((sl) => sl.type === "CAPA")?.image?.name?.toLowerCase() ??
		archive.slides.find((sl) => sl.image?.name)?.image?.name?.toLowerCase();
	if (coverMatchName && uploadedAssets.length) {
		const coverMatch = uploadedAssets.find(
			(a) =>
				coverMatchName.includes(a.path.toLowerCase()) ||
				a.path.toLowerCase().includes(coverMatchName),
		);
		if (coverMatch) {
			await updateCustomMusic(musicId, { id_file_image: coverMatch.idFile });
		}
	}

	// Lyrics em paralelo (batch de 5) com order EXPLÍCITO — a ordem é
	// garantida pelo campo, não pela sequência de requests. 15 slides caem
	// de 15 RTTs (~10s) para ~3.
	let slideCount = 0;
	const LYRIC_BATCH = 5;
	for (let i = 0; i < slides.length; i += LYRIC_BATCH) {
		const created = await Promise.all(slides.slice(i, i + LYRIC_BATCH).map((slide, j) => {
			const imageUrl = matchUploadedAsset(slide.image?.name, uploadedAssets)?.url ?? "";
			return createCustomLyric(musicId, {
				lyric: slide.lyric.trim(),
				aux_lyric: slide.auxiliaryLyric?.trim() || undefined,
				time: formatSljaMsAsTime(slide.timeMs),
				order: i + j + 1,
				id_file_image: imageIdByUrl.get(imageUrl),
				image_position: slide.imagePosition ?? undefined,
			});
		}));
		slideCount += created.filter(Boolean).length;
	}
	// Upload de mídia pode falhar e o import segue só com texto. Estrofe
	// incompleta não: a projeção ficaria truncada e o dialog trataria como sucesso.
	if (slideCount < slides.length) {
		await deleteCustomMusic(musicId);
		throw new Error("SLJA_IMPORT_LYRICS_INCOMPLETE");
	}

	return {
		musicId,
		displayMusicId: toCustomMusicId(musicId),
		name,
		collectionId,
		slides: slideCount,
		hasAudio,
		uploadedImages,
		durationMs,
		local: false,
		sljaHash,
		updatedExisting: false,
		imagesOmitted: false,
	};
}

/**
 * Import local (deslogado): áudio vira base64 no LocalMusic (o player já
 * monta data: URL — loadCustomMusicTrack, branch isLocalId) e as estrofes
 * vão com timing (time HH:MM:SS). Nada sobe pra rede.
 */
function matchUploadedAsset(
	imageName: string | undefined,
	assets: Array<{ path: string; url: string; idFile: number }>,
) {
	if (!imageName || assets.length === 0) return undefined;
	const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
	const needle = normalize(imageName);
	const exact = assets.find(asset => normalize(asset.path) === needle);
	if (exact) return exact;
	const basename = needle.split("/").pop();
	const candidates = assets.filter(asset => normalize(asset.path).split("/").pop() === basename);
	return candidates.length === 1 ? candidates[0] : undefined;
}

async function importSljaLocal({
	name,
	archive,
	slides,
	durationMs,
	sljaHash,
	coverImageName,
}: {
	name: string;
	archive: Awaited<ReturnType<typeof parseSljaFile>>;
	slides: Array<{
		lyric: string;
		timeMs: number;
		order?: number;
		auxiliaryLyric?: string;
		image?: { name: string };
	}>;
	durationMs: number;
	sljaHash: string;
	coverImageName?: string;
}): Promise<ImportedSljaLiturgyMusic> {
	// Import dinâmico: mantém a API fora do caminho local (offline-first e
	// testes sem rede nunca tocam fetch).
	const {
		createLocalCollection,
		createLocalMusic,
		createLocalLyric,
		updateLocalMusic,
		getLocalMusic,
		deleteLocalMusic,
		listLocalCollections,
	} = await import("@modules/media/services/local-custom-store");

	let collectionId = listLocalCollections().find(
		(c) => c.name === IMPORT_COLLECTION_NAME,
	)?.id;
	if (collectionId == null) {
		collectionId = createLocalCollection(IMPORT_COLLECTION_NAME).id;
	}

	const created = createLocalMusic(collectionId, { name });
	const musicId = created.id;
	if (!getLocalMusic(musicId)) {
		throw new Error("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
	}

	let hasAudio = false;
	if (archive.audio?.bytes?.length) {
		const saved = updateLocalMusic(musicId, {
			audioBase64: bytesToBase64(archive.audio.bytes),
			audioName: archive.audio.name,
		});
		const storedAudio = getLocalMusic(musicId)?.audioBase64;
		hasAudio = saved && Boolean(storedAudio);
		if (!hasAudio) {
			deleteLocalMusic(musicId);
			throw new Error("SLJA_LOCAL_AUDIO_PERSIST_FAILED");
		}
	}
	// Duração estimada do item (último tempo_hms + margem) — o dialog aplica
	// no draft e o catálogo da liturgia expõe; 0 = desconhecida.
	let persistedDurationMs = 0;
	if (durationMs > 0 && updateLocalMusic(musicId, { durationMs })) {
		persistedDurationMs = getLocalMusic(musicId)?.durationMs ?? 0;
	}

	// Fundo compartilhado (padrão web#174): primeiro asset do .slja vira data:
	// URL e cobre a capa + todos os slides (o .slja traz fundo único).
	let coverDataUrl: string | null = null;
	if (archive.assets?.length && archive.assets[0]?.bytes?.length) {
		coverDataUrl = `data:image/png;base64,${bytesToBase64(archive.assets[0].bytes)}`;
		updateLocalMusic(musicId, { image_url: coverDataUrl });
	}

	let slideCount = 0;
	try {
		for (const slide of slides) {
			const text = slide.lyric.trim();
			// Empty lyrics were removed before any asynchronous import work.
			createLocalLyric(musicId, {
				lyric: text,
				aux_lyric: slide.auxiliaryLyric?.trim() || undefined,
				image_url: coverDataUrl,
				time: formatSljaMsAsTime(slide.timeMs),
			});
			const persisted = getLocalMusic(musicId)?.lyrics.some(
				(lyric) => lyric.lyric === text,
			);
			if (!persisted) {
				throw new Error("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
			}
			slideCount += 1;
		}
	} catch (error) {
		deleteLocalMusic(musicId);
		if (error instanceof Error && error.message === "local-persist-failed") {
			throw new Error("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
		}
		throw error;
	}

	return {
		musicId,
		// id local viaja CRU no item — offsetar (999.99x) cairia fora dos dois
		// namespaces que o player resolve (regra do namespace unificado).
		displayMusicId: musicId,
		name,
		collectionId,
		slides: slideCount,
		hasAudio,
		uploadedImages: 0,
		durationMs: persistedDurationMs,
		local: true,
		sljaHash,
		updatedExisting: false,
		imagesOmitted:
			Boolean(coverImageName) ||
			(archive.assets?.length ?? 0) > 0 ||
			slides.some((slide) => Boolean(slide.image?.name)),
	};
}

/** bytes → base64 (sem any; chunks grandes em passos de 0x8000). */
function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
