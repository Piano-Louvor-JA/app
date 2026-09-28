/**
 * Preference for showing Minhas Coletâneas (custom collections) in the UI.
 * Stored in localStorage under key 'albumsShowCustomCollections'.
 * Default: true (visible) for new users.
 */
export const VISIBILITY_KEY = 'albumsShowCustomCollections';

/** Returns true if the feature should be visible. */
export function getShowCustomCollections(): boolean {
  if (typeof window === 'undefined') return true; // SSR default
  const val = localStorage.getItem(VISIBILITY_KEY);
  if (val === null) return true; // default
  return val !== 'false';
}

/** Persists the visibility preference. */
export function setShowCustomCollections(visible: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VISIBILITY_KEY, visible ? 'true' : 'false');
}