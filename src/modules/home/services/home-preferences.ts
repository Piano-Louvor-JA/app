import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
	getUserPreference,
	setUserPreference,
} from "@shared/services/user-preferences";

import { DEFAULT_HOME_LOCATION, type HomeLocationProfile } from "../types/home";

function asTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function normalizeHomeLocation(raw: unknown): HomeLocationProfile {
	if (!raw || typeof raw !== "object") {
		return { ...DEFAULT_HOME_LOCATION };
	}

	const source = raw as Record<string, unknown>;

	return {
		district: asTrimmedString(source.district),
		church: asTrimmedString(source.church),
	};
}

export function loadHomeLocation(): HomeLocationProfile {
	const stored = getUserPreference<unknown>(
		USER_PREFERENCE_KEYS.homeLocation,
		null,
	);
	return normalizeHomeLocation(stored);
}

export function loadLastKnownHomeLocation(): HomeLocationProfile {
	return normalizeHomeLocation(
		getUserPreference<unknown>(USER_PREFERENCE_KEYS.homeLocationLastKnown, null),
	);
}

/** Por campo: o novo valor, senão o que estava no campo, senão o último guardado. */
function pickLastKnown(next: string, previous: string, known: string): string {
	return next || previous || known;
}

export function saveHomeLocation(profile: HomeLocationProfile): void {
	const next = normalizeHomeLocation(profile);
	// Lê antes de sobrescrever: quem preencheu antes desta versão (ou recebeu
	// pelo sync) e apaga agora ainda tem o valor guardado.
	const previous = loadHomeLocation();
	const known = loadLastKnownHomeLocation();
	setUserPreference(USER_PREFERENCE_KEYS.homeLocation, next);
	const lastKnown: HomeLocationProfile = {
		district: pickLastKnown(next.district, previous.district, known.district),
		church: pickLastKnown(next.church, previous.church, known.church),
	};
	if (lastKnown.district !== known.district || lastKnown.church !== known.church) {
		setUserPreference(USER_PREFERENCE_KEYS.homeLocationLastKnown, lastKnown);
	}
}

/**
 * Distrito/igreja para a telemetria (SPEC telemetria-dispositivos §3.1):
 * o campo atual; se estiver vazio, o último valor já digitado nele.
 */
export function resolveReportedHomeLocation(): HomeLocationProfile {
	const current = loadHomeLocation();
	const known = loadLastKnownHomeLocation();
	return {
		district: current.district || known.district,
		church: current.church || known.church,
	};
}
