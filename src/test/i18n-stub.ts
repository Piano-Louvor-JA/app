// Helper de teste: t() que resolve chaves nos catálogos reais pt-BR (core + módulos).
// Catálogos são objetos puros (sem vue-i18n) — seguro dentro de vi.mock factories.
import ptBR from '@locales/pt-BR'
import AuthPtBR from '@modules/auth/locales/pt-BR'
import AlbumsPtBR from '@modules/albums/locales/pt-BR'
import CommunityPtBR from '@modules/community/locales/pt-BR'
import BiblePtBR from '@modules/bible/locales/pt-BR'
import ClockPtBR from '@modules/clock/locales/pt-BR'
import CountdownPtBR from '@modules/countdown/locales/pt-BR'
import SabbathSchoolPtBR from '@modules/sabbath-school/locales/pt-BR'
import AnnouncementsPtBR from '@modules/announcements/locales/pt-BR'
import HomePtBR from '@modules/home/locales/pt-BR'
import LiturgyPtBR from '@modules/liturgy/locales/pt-BR'
import MediaPtBR from '@modules/media/locales/pt-BR'
import RandomPtBR from '@modules/random/locales/pt-BR'
import YoutubePtBR from '@modules/youtube/locales/pt-BR'
import SettingsPtBR from '@modules/settings/locales/pt-BR'
import StartingPtBR from '@modules/starting/locales/pt-BR'
import SyncPtBR from '@modules/sync/locales/pt-BR'
import TimerPtBR from '@modules/timer/locales/pt-BR'

type Dict = Record<string, unknown>

function flatten(obj: Dict, prefix = ''): Dict {
  const out: Dict = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key))
    else out[key] = v
  }
  return out
}

const messages: Dict = flatten({
  ...ptBR,
  ...AuthPtBR,
  ...AlbumsPtBR,
  ...CommunityPtBR,
  ...BiblePtBR,
  ...ClockPtBR,
  ...CountdownPtBR,
  ...SabbathSchoolPtBR,
  ...AnnouncementsPtBR,
  ...HomePtBR,
  ...LiturgyPtBR,
  ...MediaPtBR,
  ...RandomPtBR,
  ...YoutubePtBR,
  ...SettingsPtBR,
  ...StartingPtBR,
  ...SyncPtBR,
  ...TimerPtBR,
} as Dict)

export function tPtBR(key: string, params?: Record<string, unknown>): string {
  let s = (messages[key] as string) ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export const useI18nStub = () => ({ t: tPtBR, locale: { value: 'pt-BR' } })
