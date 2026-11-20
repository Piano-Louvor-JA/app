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

export function saveHomeLocation(profile: HomeLocationProfile): void {
	setUserPreference(USER_PREFERENCE_KEYS.homeLocation, {
		district: profile.district.trim(),
		church: profile.church.trim(),
	});
}
