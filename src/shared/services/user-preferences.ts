import { BROWSER_STORAGE_KEYS } from "@shared/constants/storage-keys";
import {
  getBrowserItem,
  setBrowserItem,
} from "@shared/services/browser-storage";

export type UserPreferences = Record<string, unknown>;

export function loadUserPreferences(): UserPreferences {
  return (
    getBrowserItem<UserPreferences>(BROWSER_STORAGE_KEYS.userPreferences, {}) ??
    {}
  );
}

export function saveUserPreferences(preferences: UserPreferences): void {
  setBrowserItem(BROWSER_STORAGE_KEYS.userPreferences, preferences);
}

/**
 * Hook de sync (app#349): registrado no boot pelo módulo de sync — é
 * chamado a CADA setUserPreference de key sincronizável. Mantém shared
 * sem dependência de modules (inversão). Múltiplos hooks (t_5582d47e: o
 * espelho do idioma para o splash também escuta) — todos rodam; erro de um
 * não bloqueia os demais.
 */
const prefsChangedHooks: Array<(key: string) => void> = [];

export function registerPrefsChangedHook(fn: (key: string) => void): void {
  prefsChangedHooks.push(fn);
}

function runPrefsChangedHooks(key: string): void {
  for (const fn of prefsChangedHooks) {
    try {
      fn(key);
    } catch {
      // hook nunca bloqueia o fluxo local nem os demais hooks
    }
  }
}

export function setUserPreference(
  key: string,
  value: unknown,
): UserPreferences {
  const current = loadUserPreferences();
  const next = { ...current, [key]: value };
  saveUserPreferences(next);
  try {
    runPrefsChangedHooks(key);
  } catch {
    // hook de sync nunca bloqueia o fluxo local
  }
  return next;
}

export function getUserPreference<T = unknown>(
  key: string,
  fallback: T | null = null,
): T | null {
  const current = loadUserPreferences();
  if (!(key in current)) return fallback;
  return current[key] as T;
}
