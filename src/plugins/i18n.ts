import { createI18n } from 'vue-i18n'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'
import ru from '@locales/ru'
import uk from '@locales/uk'
import fr from '@locales/fr'
import ja from '@locales/ja'
import ko from '@locales/ko'
import zh from '@locales/zh'
import tr from '@locales/tr'
import ar from '@locales/ar'
import hi from '@locales/hi'
import it from '@locales/it'
import nl from '@locales/nl'
import pl from '@locales/pl'

import AuthPtBR from '@modules/auth/locales/pt-BR'
import AuthEn from '@modules/auth/locales/en'
import AuthEs from '@modules/auth/locales/es'
import AuthRu from '@modules/auth/locales/ru'
import AuthUk from '@modules/auth/locales/uk'
import AuthFr from '@modules/auth/locales/fr'
import AuthJa from '@modules/auth/locales/ja'
import AuthKo from '@modules/auth/locales/ko'
import AuthZh from '@modules/auth/locales/zh'
import AuthTr from '@modules/auth/locales/tr'
import AuthAr from '@modules/auth/locales/ar'
import AuthHi from '@modules/auth/locales/hi'
import AuthIt from '@modules/auth/locales/it'
import AuthNl from '@modules/auth/locales/nl'
import AuthPl from '@modules/auth/locales/pl'
import AlbumsPtBR from '@modules/albums/locales/pt-BR'
import AlbumsEn from '@modules/albums/locales/en'
import AlbumsEs from '@modules/albums/locales/es'
import AlbumsRu from '@modules/albums/locales/ru'
import AlbumsUk from '@modules/albums/locales/uk'
import AlbumsFr from '@modules/albums/locales/fr'
import AlbumsJa from '@modules/albums/locales/ja'
import AlbumsKo from '@modules/albums/locales/ko'
import AlbumsZh from '@modules/albums/locales/zh'
import AlbumsTr from '@modules/albums/locales/tr'
import AlbumsAr from '@modules/albums/locales/ar'
import AlbumsHi from '@modules/albums/locales/hi'
import AlbumsIt from '@modules/albums/locales/it'
import AlbumsNl from '@modules/albums/locales/nl'
import AlbumsPl from '@modules/albums/locales/pl'
import CommunityPtBR from '@modules/community/locales/pt-BR'
import CommunityEn from '@modules/community/locales/en'
import CommunityEs from '@modules/community/locales/es'
import CommunityRu from '@modules/community/locales/ru'
import CommunityUk from '@modules/community/locales/uk'
import CommunityFr from '@modules/community/locales/fr'
import CommunityJa from '@modules/community/locales/ja'
import CommunityKo from '@modules/community/locales/ko'
import CommunityZh from '@modules/community/locales/zh'
import CommunityTr from '@modules/community/locales/tr'
import CommunityAr from '@modules/community/locales/ar'
import CommunityHi from '@modules/community/locales/hi'
import CommunityIt from '@modules/community/locales/it'
import CommunityNl from '@modules/community/locales/nl'
import CommunityPl from '@modules/community/locales/pl'
import BiblePtBR from '@modules/bible/locales/pt-BR'
import BibleEn from '@modules/bible/locales/en'
import BibleEs from '@modules/bible/locales/es'
import BibleRu from '@modules/bible/locales/ru'
import BibleUk from '@modules/bible/locales/uk'
import BibleFr from '@modules/bible/locales/fr'
import BibleJa from '@modules/bible/locales/ja'
import BibleKo from '@modules/bible/locales/ko'
import BibleZh from '@modules/bible/locales/zh'
import BibleTr from '@modules/bible/locales/tr'
import BibleAr from '@modules/bible/locales/ar'
import BibleHi from '@modules/bible/locales/hi'
import BibleIt from '@modules/bible/locales/it'
import BibleNl from '@modules/bible/locales/nl'
import BiblePl from '@modules/bible/locales/pl'
import ClockPtBR from '@modules/clock/locales/pt-BR'
import ClockEn from '@modules/clock/locales/en'
import ClockEs from '@modules/clock/locales/es'
import ClockRu from '@modules/clock/locales/ru'
import ClockUk from '@modules/clock/locales/uk'
import ClockFr from '@modules/clock/locales/fr'
import ClockJa from '@modules/clock/locales/ja'
import ClockKo from '@modules/clock/locales/ko'
import ClockZh from '@modules/clock/locales/zh'
import ClockTr from '@modules/clock/locales/tr'
import ClockAr from '@modules/clock/locales/ar'
import ClockHi from '@modules/clock/locales/hi'
import ClockIt from '@modules/clock/locales/it'
import ClockNl from '@modules/clock/locales/nl'
import ClockPl from '@modules/clock/locales/pl'
import CountdownPtBR from '@modules/countdown/locales/pt-BR'
import CountdownEn from '@modules/countdown/locales/en'
import CountdownEs from '@modules/countdown/locales/es'
import CountdownRu from '@modules/countdown/locales/ru'
import CountdownUk from '@modules/countdown/locales/uk'
import CountdownFr from '@modules/countdown/locales/fr'
import CountdownJa from '@modules/countdown/locales/ja'
import CountdownKo from '@modules/countdown/locales/ko'
import CountdownZh from '@modules/countdown/locales/zh'
import CountdownTr from '@modules/countdown/locales/tr'
import CountdownAr from '@modules/countdown/locales/ar'
import CountdownHi from '@modules/countdown/locales/hi'
import CountdownIt from '@modules/countdown/locales/it'
import CountdownNl from '@modules/countdown/locales/nl'
import CountdownPl from '@modules/countdown/locales/pl'
import SabbathSchoolPtBR from '@modules/sabbath-school/locales/pt-BR'
import SabbathSchoolEn from '@modules/sabbath-school/locales/en'
import SabbathSchoolEs from '@modules/sabbath-school/locales/es'
import SabbathSchoolRu from '@modules/sabbath-school/locales/ru'
import SabbathSchoolUk from '@modules/sabbath-school/locales/uk'
import SabbathSchoolFr from '@modules/sabbath-school/locales/fr'
import SabbathSchoolJa from '@modules/sabbath-school/locales/ja'
import SabbathSchoolKo from '@modules/sabbath-school/locales/ko'
import SabbathSchoolZh from '@modules/sabbath-school/locales/zh'
import SabbathSchoolTr from '@modules/sabbath-school/locales/tr'
import SabbathSchoolAr from '@modules/sabbath-school/locales/ar'
import SabbathSchoolHi from '@modules/sabbath-school/locales/hi'
import SabbathSchoolIt from '@modules/sabbath-school/locales/it'
import SabbathSchoolNl from '@modules/sabbath-school/locales/nl'
import SabbathSchoolPl from '@modules/sabbath-school/locales/pl'
import AnnouncementsPtBR from '@modules/announcements/locales/pt-BR'
import AnnouncementsEn from '@modules/announcements/locales/en'
import AnnouncementsEs from '@modules/announcements/locales/es'
import AnnouncementsRu from '@modules/announcements/locales/ru'
import AnnouncementsUk from '@modules/announcements/locales/uk'
import AnnouncementsFr from '@modules/announcements/locales/fr'
import AnnouncementsJa from '@modules/announcements/locales/ja'
import AnnouncementsKo from '@modules/announcements/locales/ko'
import AnnouncementsZh from '@modules/announcements/locales/zh'
import AnnouncementsTr from '@modules/announcements/locales/tr'
import AnnouncementsAr from '@modules/announcements/locales/ar'
import AnnouncementsHi from '@modules/announcements/locales/hi'
import AnnouncementsIt from '@modules/announcements/locales/it'
import AnnouncementsNl from '@modules/announcements/locales/nl'
import AnnouncementsPl from '@modules/announcements/locales/pl'
import HomePtBR from '@modules/home/locales/pt-BR'
import HomeEn from '@modules/home/locales/en'
import HomeEs from '@modules/home/locales/es'
import HomeRu from '@modules/home/locales/ru'
import HomeUk from '@modules/home/locales/uk'
import HomeFr from '@modules/home/locales/fr'
import HomeJa from '@modules/home/locales/ja'
import HomeKo from '@modules/home/locales/ko'
import HomeZh from '@modules/home/locales/zh'
import HomeTr from '@modules/home/locales/tr'
import HomeAr from '@modules/home/locales/ar'
import HomeHi from '@modules/home/locales/hi'
import HomeIt from '@modules/home/locales/it'
import HomeNl from '@modules/home/locales/nl'
import HomePl from '@modules/home/locales/pl'
import LiturgyPtBR from '@modules/liturgy/locales/pt-BR'
import LiturgyEn from '@modules/liturgy/locales/en'
import LiturgyEs from '@modules/liturgy/locales/es'
import LiturgyRu from '@modules/liturgy/locales/ru'
import LiturgyUk from '@modules/liturgy/locales/uk'
import LiturgyFr from '@modules/liturgy/locales/fr'
import LiturgyJa from '@modules/liturgy/locales/ja'
import LiturgyKo from '@modules/liturgy/locales/ko'
import LiturgyZh from '@modules/liturgy/locales/zh'
import LiturgyTr from '@modules/liturgy/locales/tr'
import LiturgyAr from '@modules/liturgy/locales/ar'
import LiturgyHi from '@modules/liturgy/locales/hi'
import LiturgyIt from '@modules/liturgy/locales/it'
import LiturgyNl from '@modules/liturgy/locales/nl'
import LiturgyPl from '@modules/liturgy/locales/pl'
import MediaPtBR from '@modules/media/locales/pt-BR'
import MediaEn from '@modules/media/locales/en'
import MediaEs from '@modules/media/locales/es'
import MediaRu from '@modules/media/locales/ru'
import MediaUk from '@modules/media/locales/uk'
import MediaFr from '@modules/media/locales/fr'
import MediaJa from '@modules/media/locales/ja'
import MediaKo from '@modules/media/locales/ko'
import MediaZh from '@modules/media/locales/zh'
import MediaTr from '@modules/media/locales/tr'
import MediaAr from '@modules/media/locales/ar'
import MediaHi from '@modules/media/locales/hi'
import MediaIt from '@modules/media/locales/it'
import MediaNl from '@modules/media/locales/nl'
import MediaPl from '@modules/media/locales/pl'
import OnboardingPtBR from '@modules/onboarding/locales/pt-BR'
import OnboardingEn from '@modules/onboarding/locales/en'
import OnboardingEs from '@modules/onboarding/locales/es'
import OnboardingRu from '@modules/onboarding/locales/ru'
import OnboardingUk from '@modules/onboarding/locales/uk'
import OnboardingFr from '@modules/onboarding/locales/fr'
import OnboardingJa from '@modules/onboarding/locales/ja'
import OnboardingKo from '@modules/onboarding/locales/ko'
import OnboardingZh from '@modules/onboarding/locales/zh'
import OnboardingTr from '@modules/onboarding/locales/tr'
import OnboardingAr from '@modules/onboarding/locales/ar'
import OnboardingHi from '@modules/onboarding/locales/hi'
import OnboardingIt from '@modules/onboarding/locales/it'
import OnboardingNl from '@modules/onboarding/locales/nl'
import OnboardingPl from '@modules/onboarding/locales/pl'
import RandomPtBR from '@modules/random/locales/pt-BR'
import RandomEn from '@modules/random/locales/en'
import RandomEs from '@modules/random/locales/es'
import RandomRu from '@modules/random/locales/ru'
import RandomUk from '@modules/random/locales/uk'
import RandomFr from '@modules/random/locales/fr'
import RandomJa from '@modules/random/locales/ja'
import RandomKo from '@modules/random/locales/ko'
import RandomZh from '@modules/random/locales/zh'
import RandomTr from '@modules/random/locales/tr'
import RandomAr from '@modules/random/locales/ar'
import RandomHi from '@modules/random/locales/hi'
import RandomIt from '@modules/random/locales/it'
import RandomNl from '@modules/random/locales/nl'
import RandomPl from '@modules/random/locales/pl'
import YoutubePtBR from '@modules/youtube/locales/pt-BR'
import YoutubeEn from '@modules/youtube/locales/en'
import YoutubeEs from '@modules/youtube/locales/es'
import YoutubeRu from '@modules/youtube/locales/ru'
import YoutubeUk from '@modules/youtube/locales/uk'
import YoutubeFr from '@modules/youtube/locales/fr'
import YoutubeJa from '@modules/youtube/locales/ja'
import YoutubeKo from '@modules/youtube/locales/ko'
import YoutubeZh from '@modules/youtube/locales/zh'
import YoutubeTr from '@modules/youtube/locales/tr'
import YoutubeAr from '@modules/youtube/locales/ar'
import YoutubeHi from '@modules/youtube/locales/hi'
import YoutubeIt from '@modules/youtube/locales/it'
import YoutubeNl from '@modules/youtube/locales/nl'
import YoutubePl from '@modules/youtube/locales/pl'
import SettingsPtBR from '@modules/settings/locales/pt-BR'
import SettingsEn from '@modules/settings/locales/en'
import SettingsEs from '@modules/settings/locales/es'
import SettingsRu from '@modules/settings/locales/ru'
import SettingsUk from '@modules/settings/locales/uk'
import SettingsFr from '@modules/settings/locales/fr'
import SettingsJa from '@modules/settings/locales/ja'
import SettingsKo from '@modules/settings/locales/ko'
import SettingsZh from '@modules/settings/locales/zh'
import SettingsTr from '@modules/settings/locales/tr'
import SettingsAr from '@modules/settings/locales/ar'
import SettingsHi from '@modules/settings/locales/hi'
import SettingsIt from '@modules/settings/locales/it'
import SettingsNl from '@modules/settings/locales/nl'
import SettingsPl from '@modules/settings/locales/pl'
import StartingPtBR from '@modules/starting/locales/pt-BR'
import StartingEn from '@modules/starting/locales/en'
import StartingEs from '@modules/starting/locales/es'
import StartingRu from '@modules/starting/locales/ru'
import StartingUk from '@modules/starting/locales/uk'
import StartingFr from '@modules/starting/locales/fr'
import StartingJa from '@modules/starting/locales/ja'
import StartingKo from '@modules/starting/locales/ko'
import StartingZh from '@modules/starting/locales/zh'
import StartingTr from '@modules/starting/locales/tr'
import StartingAr from '@modules/starting/locales/ar'
import StartingHi from '@modules/starting/locales/hi'
import StartingIt from '@modules/starting/locales/it'
import StartingNl from '@modules/starting/locales/nl'
import StartingPl from '@modules/starting/locales/pl'
import SyncPtBR from '@modules/sync/locales/pt-BR'
import SyncEn from '@modules/sync/locales/en'
import SyncEs from '@modules/sync/locales/es'
import SyncRu from '@modules/sync/locales/ru'
import SyncUk from '@modules/sync/locales/uk'
import SyncFr from '@modules/sync/locales/fr'
import SyncJa from '@modules/sync/locales/ja'
import SyncKo from '@modules/sync/locales/ko'
import SyncZh from '@modules/sync/locales/zh'
import SyncTr from '@modules/sync/locales/tr'
import SyncAr from '@modules/sync/locales/ar'
import SyncHi from '@modules/sync/locales/hi'
import SyncIt from '@modules/sync/locales/it'
import SyncNl from '@modules/sync/locales/nl'
import SyncPl from '@modules/sync/locales/pl'
import TimerPtBR from '@modules/timer/locales/pt-BR'
import TimerEn from '@modules/timer/locales/en'
import TimerEs from '@modules/timer/locales/es'
import TimerRu from '@modules/timer/locales/ru'
import TimerUk from '@modules/timer/locales/uk'
import TimerFr from '@modules/timer/locales/fr'
import TimerJa from '@modules/timer/locales/ja'
import TimerKo from '@modules/timer/locales/ko'
import TimerZh from '@modules/timer/locales/zh'
import TimerTr from '@modules/timer/locales/tr'
import TimerAr from '@modules/timer/locales/ar'
import TimerHi from '@modules/timer/locales/hi'
import TimerIt from '@modules/timer/locales/it'
import TimerNl from '@modules/timer/locales/nl'
import TimerPl from '@modules/timer/locales/pl'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference } from '@shared/services/user-preferences'

export const SUPPORTED_LOCALES = ["pt-BR","en","es","ru","uk","fr","ja","ko","zh","tr","ar","hi","it","nl","pl"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'pt-BR'

/**
 * Retorna o idioma armazenado nas preferencias do usuario,
 * ou `DEFAULT_LOCALE` se nao houver preferencia valida.
 */
export function detectInitialLocale(): SupportedLocale {
  const saved = getUserPreference<string>(USER_PREFERENCE_KEYS.language, null)
  if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) {
    return saved as SupportedLocale
  }
  return DEFAULT_LOCALE
}

/**
 * Converte um locale BCP-47 (ex: `pt-BR`, `en-US`, `es-ES`) para o
 * prefixo usado pela API do Louvor JA (`pt`, `en`, `es`).
 */
export { localeToApiPrefix } from '@modules/sync/services/api-prefix'

const initialLocale = detectInitialLocale()

export default createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'pt-BR': {
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
      ...OnboardingPtBR,
      ...LiturgyPtBR,
      ...MediaPtBR,
      ...RandomPtBR,
      ...YoutubePtBR,
      ...SettingsPtBR,
      ...StartingPtBR,
      ...SyncPtBR,
      ...TimerPtBR,
    },
    en: {
      ...en,
      ...AuthEn,
      ...AlbumsEn,
      ...CommunityEn,
      ...BibleEn,
      ...ClockEn,
      ...CountdownEn,
      ...SabbathSchoolEn,
      ...AnnouncementsEn,
      ...HomeEn,
      ...OnboardingEn,
      ...LiturgyEn,
      ...MediaEn,
      ...RandomEn,
      ...YoutubeEn,
      ...SettingsEn,
      ...StartingEn,
      ...SyncEn,
      ...TimerEn,
    },
    es: {
      ...es,
      ...AuthEs,
      ...AlbumsEs,
      ...CommunityEs,
      ...BibleEs,
      ...ClockEs,
      ...CountdownEs,
      ...SabbathSchoolEs,
      ...AnnouncementsEs,
      ...HomeEs,
      ...OnboardingEs,
      ...LiturgyEs,
      ...MediaEs,
      ...RandomEs,
      ...YoutubeEs,
      ...SettingsEs,
      ...StartingEs,
      ...SyncEs,
      ...TimerEs,
    },
    ru: {
      ...ru,
      ...AuthRu,
      ...AlbumsRu,
      ...CommunityRu,
      ...BibleRu,
      ...ClockRu,
      ...CountdownRu,
      ...SabbathSchoolRu,
      ...AnnouncementsRu,
      ...HomeRu,
      ...OnboardingRu,
      ...LiturgyRu,
      ...MediaRu,
      ...RandomRu,
      ...YoutubeRu,
      ...SettingsRu,
      ...StartingRu,
      ...SyncRu,
      ...TimerRu,
    },
    uk: {
      ...uk,
      ...AuthUk,
      ...AlbumsUk,
      ...CommunityUk,
      ...BibleUk,
      ...ClockUk,
      ...CountdownUk,
      ...SabbathSchoolUk,
      ...AnnouncementsUk,
      ...HomeUk,
      ...OnboardingUk,
      ...LiturgyUk,
      ...MediaUk,
      ...RandomUk,
      ...YoutubeUk,
      ...SettingsUk,
      ...StartingUk,
      ...SyncUk,
      ...TimerUk,
    },
    fr: {
      ...fr,
      ...AuthFr,
      ...AlbumsFr,
      ...CommunityFr,
      ...BibleFr,
      ...ClockFr,
      ...CountdownFr,
      ...SabbathSchoolFr,
      ...AnnouncementsFr,
      ...HomeFr,
      ...OnboardingFr,
      ...LiturgyFr,
      ...MediaFr,
      ...RandomFr,
      ...YoutubeFr,
      ...SettingsFr,
      ...StartingFr,
      ...SyncFr,
      ...TimerFr,
    },
    ja: {
      ...ja,
      ...AuthJa,
      ...AlbumsJa,
      ...CommunityJa,
      ...BibleJa,
      ...ClockJa,
      ...CountdownJa,
      ...SabbathSchoolJa,
      ...AnnouncementsJa,
      ...HomeJa,
      ...OnboardingJa,
      ...LiturgyJa,
      ...MediaJa,
      ...RandomJa,
      ...YoutubeJa,
      ...SettingsJa,
      ...StartingJa,
      ...SyncJa,
      ...TimerJa,
    },
    ko: {
      ...ko,
      ...AuthKo,
      ...AlbumsKo,
      ...CommunityKo,
      ...BibleKo,
      ...ClockKo,
      ...CountdownKo,
      ...SabbathSchoolKo,
      ...AnnouncementsKo,
      ...HomeKo,
      ...OnboardingKo,
      ...LiturgyKo,
      ...MediaKo,
      ...RandomKo,
      ...YoutubeKo,
      ...SettingsKo,
      ...StartingKo,
      ...SyncKo,
      ...TimerKo,
    },
    zh: {
      ...zh,
      ...AuthZh,
      ...AlbumsZh,
      ...CommunityZh,
      ...BibleZh,
      ...ClockZh,
      ...CountdownZh,
      ...SabbathSchoolZh,
      ...AnnouncementsZh,
      ...HomeZh,
      ...OnboardingZh,
      ...LiturgyZh,
      ...MediaZh,
      ...RandomZh,
      ...YoutubeZh,
      ...SettingsZh,
      ...StartingZh,
      ...SyncZh,
      ...TimerZh,
    },
    tr: {
      ...tr,
      ...AuthTr,
      ...AlbumsTr,
      ...CommunityTr,
      ...BibleTr,
      ...ClockTr,
      ...CountdownTr,
      ...SabbathSchoolTr,
      ...AnnouncementsTr,
      ...HomeTr,
      ...OnboardingTr,
      ...LiturgyTr,
      ...MediaTr,
      ...RandomTr,
      ...YoutubeTr,
      ...SettingsTr,
      ...StartingTr,
      ...SyncTr,
      ...TimerTr,
    },
    ar: {
      ...ar,
      ...AuthAr,
      ...AlbumsAr,
      ...CommunityAr,
      ...BibleAr,
      ...ClockAr,
      ...CountdownAr,
      ...SabbathSchoolAr,
      ...AnnouncementsAr,
      ...HomeAr,
      ...OnboardingAr,
      ...LiturgyAr,
      ...MediaAr,
      ...RandomAr,
      ...YoutubeAr,
      ...SettingsAr,
      ...StartingAr,
      ...SyncAr,
      ...TimerAr,
    },
    hi: {
      ...hi,
      ...AuthHi,
      ...AlbumsHi,
      ...CommunityHi,
      ...BibleHi,
      ...ClockHi,
      ...CountdownHi,
      ...SabbathSchoolHi,
      ...AnnouncementsHi,
      ...HomeHi,
      ...OnboardingHi,
      ...LiturgyHi,
      ...MediaHi,
      ...RandomHi,
      ...YoutubeHi,
      ...SettingsHi,
      ...StartingHi,
      ...SyncHi,
      ...TimerHi,
    },
    pl: {
      ...pl,
      ...AuthPl,
      ...AlbumsPl,
      ...CommunityPl,
      ...BiblePl,
      ...ClockPl,
      ...CountdownPl,
      ...SabbathSchoolPl,
      ...AnnouncementsPl,
      ...HomePl,
      ...OnboardingPl,
      ...LiturgyPl,
      ...MediaPl,
      ...RandomPl,
      ...YoutubePl,
      ...SettingsPl,
      ...StartingPl,
      ...SyncPl,
      ...TimerPl,
    },
    nl: {
      ...nl,
      ...AuthNl,
      ...AlbumsNl,
      ...CommunityNl,
      ...BibleNl,
      ...ClockNl,
      ...CountdownNl,
      ...SabbathSchoolNl,
      ...AnnouncementsNl,
      ...HomeNl,
      ...OnboardingNl,
      ...LiturgyNl,
      ...MediaNl,
      ...RandomNl,
      ...YoutubeNl,
      ...SettingsNl,
      ...StartingNl,
      ...SyncNl,
      ...TimerNl,
    },
    it: {
      ...it,
      ...AuthIt,
      ...AlbumsIt,
      ...CommunityIt,
      ...BibleIt,
      ...ClockIt,
      ...CountdownIt,
      ...SabbathSchoolIt,
      ...AnnouncementsIt,
      ...HomeIt,
      ...OnboardingIt,
      ...LiturgyIt,
      ...MediaIt,
      ...RandomIt,
      ...YoutubeIt,
      ...SettingsIt,
      ...StartingIt,
      ...SyncIt,
      ...TimerIt,
    },
  },
})
