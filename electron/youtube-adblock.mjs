import { ElectronBlocker } from "@cliqz/adblocker-electron";
import { ipcMain, session } from "electron";
import { registerYoutubeEmbedHeaders } from "./youtube-embed.mjs";
import { disableYoutubeAdSkip, enableYoutubeAdSkip } from "./youtube-ad-skip.mjs";

/**
 * Bloqueador de anúncios do YouTube (opt-in).
 *
 * Duas camadas:
 * - youtube-ad-skip.mjs: esconde, silencia e pula o anúncio em vídeo dentro
 *   do player (o filtro de rede não pega esse anúncio);
 * - filtros de rede da engine do Brave (adblock-rust via
 *   @cliqz/adblocker-electron) no webRequest da session padrão, para
 *   banners e rastreadores de anúncio.
 *
 * Regra de produto: LIGADO por padrão; o usuário pode desligar nas
 * Configurações, e essa escolha é respeitada nas próximas aberturas.
 */

let active = false;

/** Estado salvo em `yt-adblock.json`: só fica desligado se o usuário desligou. */
export function adblockEnabledFromRecord(record) {
	return record?.enabled !== false;
}

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
	// O usuário pode ter desligado enquanto a lista baixava.
	if (!active) return;
	blocker = next;
	// escopo de efeito: defaultSession (o embed roda nela). O disable desta
	// lib limpa TODOS os webRequest listeners da session — re-registramos o
	// fix de Referer logo abaixo, senão o embed perde o header (Error 153).
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

export function disableAdblocker() {
	if (!active) return { ok: true, already: true };
	active = false;
	disableYoutubeAdSkip();
	if (!blocker) return { ok: true };
	try {
		blocker.disableBlockingInSession(session.defaultSession);
	} finally {
		blocker = null;
		// onBeforeRequest(null)/onHeadersReceived(null) da lib limpa o listener
		// do fix de Referer também — restaura.
		registerYoutubeEmbedHeaders();
	}
	return { ok: true };
}

export function isAdblockerEnabled() {
	return active;
}

export async function setAdblocker(enabled) {
	return enabled ? enableAdblocker() : disableAdblocker();
}

/** Registra IPC yt-adblock:* */
export function registerAdblockerIpc(persist, restore) {
	// persist(estado) — callback pra gravar o setting; restore() — lê no boot
	ipcRegister(persist, restore);
}

function ipcRegister(persist, restore) {
	ipcMain.handle("yt-adblock:status", () => ({
		enabled: isAdblockerEnabled(),
	}));
	ipcMain.handle("yt-adblock:set", async (_e, enabled) => {
		const r = await setAdblocker(Boolean(enabled));
		if (r.ok && persist) persist(Boolean(enabled));
		return r;
	});
	// boot: restaura último estado escolhido
	void (async () => {
		try {
			const saved = restore ? await restore() : false;
			if (saved) await enableAdblocker();
		} catch {
			/* boot segue sem adblock */
		}
	})();
}

export function _resetAdblockerForTests() {
	active = false;
	blocker = null;
}
