import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

export const LIBRAS_PREFERENCE_KEYS = {
  enabled: 'libras.enabled',
  avatar: 'libras.avatar',
  regionalism: 'libras.regionalism',
  subtitle: 'libras.subtitle',
  speed: 'libras.speed',
} as const

export type LibrasAvatar = 'icaro' | 'hozana' | 'guga'
const AVATARS: readonly LibrasAvatar[] = ['icaro', 'hozana', 'guga']

/**
 * Regionalismo Libras (F-B.4): variações regionais são substituições de gloss
 * ANTES do player. A API pública VLibras não aceita região (validado:
 * `region` no body → 422 Unrecognized key). Cada região mapeia palavras
 * cujo sinal varia p/ glosa equivalente regional aceita pelo dicionário VLibras.
 * Fontes: estudos de variação regional em Libras (UFMS/UFU) + Handtalk.
 * ponytail: mapa pequeno com exemplos canônicos; crescer via dicionário
 * comunitário quando a comunidade alimentar (SPEC v2 — sign-pack editável).
 */
export type LibrasRegionalism = 'default' | 'nordeste' | 'sul' | 'sudeste' | 'norte' | 'centro-oeste'
const REGIONALISMS: readonly LibrasRegionalism[] = [
  'default', 'nordeste', 'sul', 'sudeste', 'norte', 'centro-oeste',
]

/** Substituições de gloss por região (chave = termo padrão, valor = variante regional). */
const REGIONAL_GLOSS_MAP: Record<Exclude<LibrasRegionalism, 'default'>, Record<string, string>> = {
  nordeste: { 'VERDE': 'VERDE-AR', 'TRAIN': 'TREM', 'AMARELO': 'AMARELO-2' },
  sul: { 'TRAIN': 'TREM-SUL', 'VERDE': 'VERDE-2' },
  sudeste: { 'TRAIN': 'TREM-SP' },
  norte: { 'TRAIN': 'TREM-N', 'VERDE': 'VERDE-N' },
  'centro-oeste': { 'TRAIN': 'TREM-CO' },
}

export function getLibrasRegionalism(): LibrasRegionalism {
  const v = getUserPreference<string>(LIBRAS_PREFERENCE_KEYS.regionalism, 'default')
  return REGIONALISMS.includes(v as LibrasRegionalism) ? (v as LibrasRegionalism) : 'default'
}

export function setLibrasRegionalism(region: LibrasRegionalism): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.regionalism, region)
}

/** Aplica variantes regionais ao gloss (word-wise; default = no-op). */
export function applyRegionalism(gloss: string): string {
  const region = getLibrasRegionalism()
  if (region === 'default') return gloss
  const map = REGIONAL_GLOSS_MAP[region]
  return gloss
    .split(' ')
    .map((term) => map[term.toUpperCase()] ?? term)
    .join(' ')
}

export function isLibrasEnabled(): boolean {
  return !!getUserPreference<boolean>(LIBRAS_PREFERENCE_KEYS.enabled, false)
}

export function setLibrasEnabled(enabled: boolean): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.enabled, enabled)
}

export function getLibrasAvatar(): LibrasAvatar {
  const v = getUserPreference<string>(LIBRAS_PREFERENCE_KEYS.avatar, 'icaro')
  return AVATARS.includes(v as LibrasAvatar) ? (v as LibrasAvatar) : 'icaro'
}

export function setLibrasAvatar(avatar: LibrasAvatar): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.avatar, avatar)
}

/** Legenda (gloss textual) no player Unity — default ligada (comportamento widget oficial). */
export function isLibrasSubtitleEnabled(): boolean {
  return getUserPreference<boolean>(LIBRAS_PREFERENCE_KEYS.subtitle, true) !== false
}

export function setLibrasSubtitleEnabled(enabled: boolean): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.subtitle, enabled)
}

/**
 * Velocidade do intérprete (PlayerManager.setSlider — Player.setSpeed oficial).
 * 0.5 = lenta … 2 = rápida; default 1. Valores do widget: slider 0–1 (?)
 * mapeado linearmente — mantemos o multiplicador humano [0.5, 2].
 */
const SPEEDS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function getLibrasSpeed(): number {
  const v = getUserPreference<number | null>(LIBRAS_PREFERENCE_KEYS.speed, 1) ?? 1
  return SPEEDS.includes(v) ? v : 1
}

export function setLibrasSpeed(speed: number): void {
  setUserPreference(LIBRAS_PREFERENCE_KEYS.speed, SPEEDS.includes(speed) ? speed : 1)
}