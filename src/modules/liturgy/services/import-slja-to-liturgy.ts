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
	listCustomCollections,
	toCustomMusicId,
	updateCustomMusic,
	uploadCustomFile,
} from "@modules/media/services/custom-catalog";
import { parseSljaFile } from "@shared/services/slja";

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
	const generic = /^v[\d.]+$/.test(title) || title.length === 0;
	if (generic) {
		return fallback
			.replace(/\.slja(\.zip)?$/i, "")
			.replace(/\.zip$/i, "")
			.trim();
	}
	return title;
}

async function ensureImportCollectionId(): Promise<number | null> {
	// Reaproveita a primeira "Importações .slja" existente (mesma regra do
	// media editor); só cria se ainda não houver nenhuma.
	try {
		const collections = await listCustomCollections();
		const existing = collections.find((c) => c.name === IMPORT_COLLECTION_NAME);
		if (existing) return existing.id;
	} catch {
		// catálogo indisponível — tenta criar mesmo assim
	}
	const created = await createCustomCollection(IMPORT_COLLECTION_NAME);
	return created?.id ?? null;
}

/** Entrada mínima que o dialog tem em mão (File do input atende). */
export interface SljaImportSource {
	bytes: ArrayBuffer;
	name: string;
}

export async function importSljaAsLiturgyMusic(
	source: SljaImportSource,
): Promise<ImportedSljaLiturgyMusic> {
	const { bytes, name: fileName } = source;
	// Aceita .slja direto OU .slja.zip (wrapper do WhatsApp) — parser pronto.
	const archive = await parseSljaFile(bytes, fileName);
	const innerName = (archive as { innerName?: string }).innerName;

	const name = sljaDisplayName(archive, innerName ?? fileName);

	const slides = [...archive.slides]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.filter((slide) => slide.type !== "CAPA" && slide.lyric.trim().length > 0);

	const durationMs = estimateSljaDurationMs(slides);

	// ── Deslogado: grava 100% LOCAL (regra de produto 12/09 — sem identidade
	// não há escrita confiável na API). Uso local sem conta é requisito
	// permanente (offline-first): áudio/estrofes ficam no localStorage.
	if (!getAuthSession()) {
		return importSljaLocal({ name, archive, slides, durationMs });
	}

	// ── Logado: sobe pra API (Minhas Coletâneas → "Importações .slja").
	const collectionId = await ensureImportCollectionId();
	if (collectionId == null) {
		throw new Error("SLJA_IMPORT_COLLECTION_FAILED");
	}

	const created = await createCustomMusic(collectionId, { name });
	if (!created) {
		throw new Error("SLJA_IMPORT_MUSIC_FAILED");
	}
	const musicId = created.id;

	let hasAudio = false;
	if (archive.audio?.bytes?.length) {
		const uploadedAudio = await uploadCustomFile(
			archive.audio.bytes,
			archive.audio.name,
			"audio",
		);
		if (uploadedAudio) {
			const linked = await updateCustomMusic(musicId, {
				id_file_audio: uploadedAudio.idFile,
			});
			hasAudio = linked;
		}
	}

	let uploadedImages = 0;
	const uploadedAssets: Array<{ path: string; url: string; idFile: number }> =
		[];
	if (archive.assets?.length) {
		for (const asset of archive.assets) {
			const up = await uploadCustomFile(asset.bytes, asset.path, "imagens");
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
	const imageIdByUrl = new Map(uploadedAssets.map((a) => [a.url, a.idFile]));

	let slideCount = 0;
	for (const slide of slides) {
		const text = slide.lyric.trim();
		if (!text) continue;
		// Background do slide: imagem upada com matching igual ao media editor
		// (contains bidirecional, lowercase).
		let imageUrl = "";
		const imageName = slide.image?.name?.toLowerCase();
		if (imageName && uploadedAssets.length) {
			const match = uploadedAssets.find(
				(a) =>
					imageName.includes(a.path.toLowerCase()) ||
					a.path.toLowerCase().includes(imageName),
			);
			if (match) imageUrl = match.url;
		}
		const createdLyric = await createCustomLyric(musicId, {
			lyric: text,
			time: formatSljaMsAsTime(slide.timeMs),
			id_file_image: imageIdByUrl.get(imageUrl),
		});
		if (createdLyric) slideCount += 1;
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
	};
}

/**
 * Import local (deslogado): áudio vira base64 no LocalMusic (o player já
 * monta data: URL — loadCustomMusicTrack, branch isLocalId) e as estrofes
 * vão com timing (time HH:MM:SS). Nada sobe pra rede.
 */
async function importSljaLocal({
	name,
	archive,
	slides,
	durationMs,
}: {
	name: string;
	archive: Awaited<ReturnType<typeof parseSljaFile>>;
	slides: Array<{ lyric: string; timeMs: number; order?: number }>;
	durationMs: number;
}): Promise<ImportedSljaLiturgyMusic> {
	// Import dinâmico: mantém a API fora do caminho local (offline-first e
	// testes sem rede nunca tocam fetch).
	const {
		createLocalCollection,
		createLocalMusic,
		createLocalLyric,
		updateLocalMusic,
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

	let hasAudio = false;
	if (archive.audio?.bytes?.length) {
		updateLocalMusic(musicId, {
			audioBase64: bytesToBase64(archive.audio.bytes),
			audioName: archive.audio.name,
		});
		hasAudio = true;
	}
	// Duração estimada do item (último tempo_hms + margem) — o dialog aplica
	// no draft e o catálogo da liturgia expõe; 0 = desconhecida.
	if (durationMs > 0) {
		updateLocalMusic(musicId, { durationMs });
	}

	// Fundo compartilhado (padrão web#174): primeiro asset do .slja vira data:
	// URL e cobre a capa + todos os slides (o .slja traz fundo único).
	let coverDataUrl: string | null = null;
	if (archive.assets?.length && archive.assets[0]?.bytes?.length) {
		coverDataUrl = `data:image/png;base64,${bytesToBase64(archive.assets[0].bytes)}`;
		updateLocalMusic(musicId, { image_url: coverDataUrl });
	}

	let slideCount = 0;
	for (const slide of slides) {
		const text = slide.lyric.trim();
		if (!text) continue;
		createLocalLyric(musicId, {
			lyric: text,
			time: formatSljaMsAsTime(slide.timeMs),
			// capa única cobre todos os slides (mesma imagem do .slja)
			image_url: coverDataUrl,
		});
		slideCount += 1;
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
		durationMs,
		local: true,
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
