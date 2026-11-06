import { ElectronBlocker } from "@cliqz/adblocker-electron";
import { session } from "electron";
import { registerYoutubeEmbedHeaders } from "./youtube-embed.mjs";
import { enableYoutubeAdSkip } from "./youtube-ad-skip.mjs";

/**
 * Bloqueador de anúncios do YouTube, sempre ligado (não há opção para desligar).
 *
 * Duas camadas:
 * - youtube-ad-skip.mjs: esconde, silencia e pula o anúncio em vídeo dentro
 *   do player (o filtro de rede não pega esse anúncio);
 * - filtros de rede da engine do Brave (adblock-rust via
 *   @cliqz/adblocker-electron) no webRequest da session padrão, para
 *   banners e rastreadores de anúncio.
 */

let active = false;

/** @type {import('@cliqz/adblocker-electron').ElectronBlocker | null} */
let blocker = null;

async function enableNetworkFilters() {
	if (blocker) return;
	const next = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
	/**
	 * Fix app#177 (Windows, Ezequias 13/09): com o blocker cru, "não abre vídeo
	 * de jeito nenhum" — só funcionava desligando o adblock. Causa: a lib registra
	 * webRequest em <all_urls> E injeta cosmetic filters (preload script em todo
	 * webContents) + CSP em todo frame, o que mata o embed do YouTube.
	 * AQUI: só network filters (bloqueio de requests de anúncio) — sem CSS/DOM
	 * injection, sem CSP, sem mutation observer.
	 */
	const cfg = next.config;
	cfg.loadCosmeticFilters = false;
	cfg.loadExtendedSelectors = false;
	cfg.loadGenericCosmeticsFilters = false;
	cfg.loadCSPFilters = false;
	cfg.enableMutationObserver = false;
	cfg.enableHtmlFiltering = false;
	cfg.enablePushInjectionsOnNavigationEvents = false;
	blocker = next;
	// escopo de efeito: defaultSession (o embed roda nela). A lib substitui os
	// webRequest listeners da session — re-registramos o fix de Referer logo
	// abaixo, senão o embed perde o header (Error 153).
	blocker.enableBlockingInSession(session.defaultSession);
	registerYoutubeEmbedHeaders();
}

export async function enableAdblocker() {
	if (active) return { ok: true, already: true };
	active = true;
	enableYoutubeAdSkip();
	try {
		await enableNetworkFilters();
	} catch (error) {
		// Sem a lista (offline, CDN fora) o pulo do anúncio em vídeo segue ativo.
		console.warn("[yt-adblock] filtros de rede indisponíveis:", error?.message || error);
	}
	return { ok: true };
}

export function isAdblockerEnabled() {
	return active;
}

export function _resetAdblockerForTests() {
	active = false;
	blocker = null;
}
