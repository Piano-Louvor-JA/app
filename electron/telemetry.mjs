import { app } from "electron";

/**
 * Telemetria de erros → Glitchtip self-hosted (VM Oracle).
 *
 * - DSN público injetado no build oficial via `VITE_TELEMETRIA_DSN` (electron-builder
 *   lê do env no CI). Sem DSN = telemetria desligada e NENHUM request sai do app
 *   (desenvolvimento e builds locais ficam mudos por padrão).
 * - Falha de init nunca derruba o app.
 */
let Sentry = null;
let telemetryActive = false;

export async function startTelemetry() {
	const dsn = process.env.VITE_TELEMETRIA_DSN;
	if (!dsn) return;
	try {
		const sentry = await import("@sentry/electron/main");
		sentry.init({
			dsn,
			app,
			release: `louvorja-desktop@${app.getVersion()}`,
			environment: process.env.NODE_ENV === "development" ? "development" : "production",
			tracesSampleRate: 0,
			sendDefaultPii: false,
			beforeSend(event) {
				// só erro/crash; info/debug não sai da máquina
				if (!event.level || event.level === "info" || event.level === "debug") return null;
				return event;
			},
		});
		Sentry = sentry;
		telemetryActive = true;
	} catch (err) {
		console.warn("[telemetria] init falhou (app segue sem telemetria):", String(err).slice(0, 120));
	}
}

export function captureTelemetryError(err, context = {}) {
	if (!telemetryActive || !Sentry) return;
	Sentry.captureException(err, { extra: context });
}

export function isTelemetryActive() {
	return telemetryActive;
}
