/**
 * Personalização do Palco — modelo UNIFICADO (paridade com o APK).
 *
 * Fonte da verdade: APK `StageSettings`
 * (lib/core/services/dlna/stage_slide_painter.dart + stage_settings_repository.dart).
 * As chaves do JSON são EXATAMENTE as mesmas do APK (bg/fg/size/weight/...)
 * para permitir sync futuro via pacote .louvorja sem conversão.
 */

/**
 * Escopos de módulo com personalização de Palco. Derivados DINAMICAMENTE
 * das views de projeção existentes (glob em src/modules, padrão
 * "views/XptoProjectionView.vue") — módulo novo com projeção entra
 * sozinho na lista de abas.
 *
 * Mapeamento nome-da-view → scope:
 *   MediaProjectionView → hymns (projeção de hinos/mídia)
 *   MediaReturnProjectionView → (ignorado; reusa hymns)
 *   LiturgyWebProjectionView → liturgy
 *   <X>ProjectionView → <x> (bible, timer, random, clock, countdown…)
 */
const projectionViewModules = import.meta.glob('/src/modules/*/views/*ProjectionView.vue')

function viewNameToScope(fileName: string): string | null {
  const m = fileName.match(/^(\w+)ProjectionView\.vue$/)
  if (!m) return null
  const name = m[1]
  if (name === 'Media') return 'hymns'
  if (name === 'LiturgyWeb') return 'liturgy'
  // Tela de retorno reusa o palco de hinos — não cria aba própria.
  if (name === 'MediaReturn') return null
  return name.charAt(0).toLowerCase() + name.slice(1)
}

/** Scopes descobertos (ordenados), sem duplicatas. */
export const STAGE_MODULE_SCOPES: readonly string[] = [
  ...new Set(
    Object.keys(projectionViewModules)
      .map((p) => viewNameToScope(p.split('/').pop() ?? ''))
      .filter((s): s is string => Boolean(s)),
  ),
].sort()

export type StageModuleScope = (typeof STAGE_MODULE_SCOPES)[number]

export type StageAlign = 'left' | 'center' | 'right'
export type StageVerticalAlign = 'top' | 'middle' | 'bottom'

/** Peso da fonte do texto principal (mesmos passos do APK). */
export type StageFontWeight = 400 | 600 | 800

export type StageSettings = {
  backgroundColor: string
  textColor: string
  fontSize: number // px @1920 (60–160)
  fontWeight: StageFontWeight
  margin: number
  textShadow: boolean
  shadowBlur: number // vh (0.5–5)
  shadowIntensity: number // 0–1
  textBox: boolean
  boxOpacity: number // 0.1–0.9
  boxBorder: boolean
  textAlign: StageAlign
  textVerticalAlign: StageVerticalAlign
  footerRefColor: string
  footerRefWeight: number
  /**
   * Título (1º slide / capa): personalização própria. `null`/`undefined`
   * = herda o estilo geral da letra (compatibilidade com salvos antigos).
   */
  titleFontSize: number | null // px @1920 (60–160); null = herda fontSize
  titleFontWeight: StageFontWeight | null
  titleTextColor: string | null
  titleUpperCase: boolean
  titleTextShadow: boolean | null
  /**
   * Estrofes (slides de letra): personalização própria. `null`/`undefined`
   * = usa o estilo geral (que JÁ É o das estrofes) — espelha title*.
   */
  lyricFontSize: number | null // px @1920 (60–160); null = herda fontSize
  lyricFontWeight: StageFontWeight | null
  lyricTextColor: string | null
  lyricUpperCase: boolean
  lyricTextShadow: boolean | null
  showBibleVersion: boolean
  bibleFontSize: number // px @1920 (50–140)
  bibleFontWeight: 400 | 500 | 700
  bibleTextColor: string
  /** Data URL da imagem de fundo do escopo (1 ativa por escopo). */
  backgroundImage: string | null
  /**
   * Características PRÓPRIAS de cada módulo (aditivas — não subscrevem a base).
   * Sub-objeto existe apenas no escopo do módulo correspondente.
   */
  clock?: { style: 'digital' | 'analog'; showSeconds: boolean; format24h: boolean }
  timer?: { timeFormat: 'hh:mm:ss.ms' | 'hh:mm:ss' | 'mm:ss.ms' | 'mm:ss' }
  countdown?: { timeFormat: 'hh:mm:ss' | 'mm:ss' }
  random?: { fontSizePc: number; textTransform: 'none' | 'uppercase' | 'lowercase'; animationSpeed: 'slow' | 'normal' | 'fast' }
  /**
   * Hinos: por padrão o bg da projeção é o ASSET da música (capa/slide).
   * override=true → o backgroundImage configurado aqui vence o asset
   * (usuário pode definir um fundo próprio pra todas as músicas —
   * preferência do ESCOPO hymns, nunca global).
   */
  hymns?: { overrideBg: boolean }
}

export const DEFAULT_CLOCK_MODULE_SETTINGS: NonNullable<StageSettings['clock']> = {
  style: 'digital',
  showSeconds: true,
  format24h: true,
}

export const DEFAULT_TIMER_MODULE_SETTINGS: NonNullable<StageSettings['timer']> = {
  timeFormat: 'hh:mm:ss.ms',
}

export const DEFAULT_COUNTDOWN_MODULE_SETTINGS: NonNullable<StageSettings['countdown']> = {
  timeFormat: 'hh:mm:ss',
}

export const DEFAULT_RANDOM_MODULE_SETTINGS: NonNullable<StageSettings['random']> = {
  fontSizePc: 8,
  textTransform: 'none',
  animationSpeed: 'normal',
}

export const RANDOM_TEXT_TRANSFORM_OPTIONS: NonNullable<StageSettings['random']>['textTransform'][] = [
  'none',
  'uppercase',
  'lowercase',
]

export const RANDOM_ANIMATION_SPEED_OPTIONS: NonNullable<StageSettings['random']>['animationSpeed'][] = [
  'slow',
  'normal',
  'fast',
]

export const TIMER_TIME_FORMAT_OPTIONS: NonNullable<StageSettings['timer']>['timeFormat'][] = [
  'hh:mm:ss.ms',
  'hh:mm:ss',
  'mm:ss.ms',
  'mm:ss',
]

export const COUNTDOWN_TIME_FORMAT_OPTIONS: NonNullable<StageSettings['countdown']>['timeFormat'][] = [
  'hh:mm:ss',
  'mm:ss',
]

export const DEFAULT_STAGE_SETTINGS: StageSettings = {
  backgroundColor: '#0A0E1A',
  textColor: '#FFFFFF',
  fontSize: 96,
  fontWeight: 600,
  margin: 120,
  textShadow: true,
  shadowBlur: 2.2,
  shadowIntensity: 0.8,
  textBox: true,
  boxOpacity: 0.45,
  boxBorder: true,
  textAlign: 'center',
  textVerticalAlign: 'middle',
  footerRefColor: '#FCCE02',
  footerRefWeight: 600,
  showBibleVersion: true,
  bibleFontSize: 84,
  bibleFontWeight: 500,
  bibleTextColor: '#FFFFFF',
  titleFontSize: null,
  titleFontWeight: null,
  titleTextColor: null,
  titleUpperCase: false,
  titleTextShadow: null,
  lyricFontSize: null,
  lyricFontWeight: null,
  lyricTextColor: null,
  lyricUpperCase: false,
  lyricTextShadow: null,
  backgroundImage: null,
}

/**
 * Alinhamento do Palco → flexbox.
 * Em coluna (padrão das telas de palco) o eixo principal é o vertical:
 * Esquerda/Direita = align-items, Em cima/Em baixo = justify-content.
 */
export function stageFlexAlign(
  settings: Pick<StageSettings, 'textAlign' | 'textVerticalAlign'>,
  direction: 'row' | 'column' = 'column',
): { alignItems: string; justifyContent: string } {
  const horizontal =
    settings.textAlign === 'left'
      ? 'flex-start'
      : settings.textAlign === 'right'
        ? 'flex-end'
        : 'center'
  const vertical =
    settings.textVerticalAlign === 'top'
      ? 'flex-start'
      : settings.textVerticalAlign === 'bottom'
        ? 'flex-end'
        : 'center'
  if (direction === 'row') {
    return { alignItems: vertical, justifyContent: horizontal }
  }
  return { alignItems: horizontal, justifyContent: vertical }
}

/** Presets de fundo — mesmos do APK. */
export const STAGE_BG_PRESETS = [
  { color: '#0A0E1A', label: 'Azul-noite' },
  { color: '#000000', label: 'Preto' },
  { color: '#1B2A1F', label: 'Verde-pastoral' },
  { color: '#2A1B1B', label: 'Vinho' },
] as const

/**
 * Backgrounds oficiais — mesmos assets do casting DLNA do APK
 * (src/assets/backgrounds), servidos em /backgrounds no web.
 * A lista é DINÂMICA: qualquer bg-*.png novo em public/backgrounds
 * entra automaticamente na galeria (sem hardcode).
 * backgroundImage = null → cor; `official:bg-01` → asset oficial.
 */
const officialBgModules = import.meta.glob('../../../assets/backgrounds/bg-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** IDs dos bgs oficiais (ex.: 'bg-01'), ordenados. Piano (bg-11) vai primeiro na galeria. */
const GALLERY_LEAD_BACKGROUND = 'bg-11'

export const STAGE_OFFICIAL_BACKGROUNDS: readonly string[] = Object.keys(officialBgModules)
  .map((path) => path.match(/(bg-[\w-]+)\.png$/)?.[1])
  .filter((id): id is string => Boolean(id))
  .sort((a, b) => {
    if (a === GALLERY_LEAD_BACKGROUND) return -1
    if (b === GALLERY_LEAD_BACKGROUND) return 1
    return a.localeCompare(b, undefined, { numeric: true })
  })

/** Prefixo que marca um bg oficial (vs dataURL do usuário). */
export const OFFICIAL_BG_PREFIX = 'official:'

/** URL pública de um bg oficial (hash de build via import.meta.glob). */
export function officialBgUrl(id: string): string {
  return officialBgModules[`../../../assets/backgrounds/${id}.png`] ?? `/backgrounds/${id}.png`
}

/** Resolve o backgroundImage salvo para URL usável em <img>/CSS. */
export function resolveBackgroundImage(backgroundImage: string | null): string | null {
  if (!backgroundImage) return null
  if (backgroundImage.startsWith(OFFICIAL_BG_PREFIX)) {
    return officialBgUrl(backgroundImage.slice(OFFICIAL_BG_PREFIX.length))
  }
  return backgroundImage
}

/** Presets de cor do texto — mesmos do APK. */
export const STAGE_FG_PRESETS = [
  { color: '#FFFFFF', label: 'Branco' },
  { color: '#FFE9A8', label: 'Amarelo suave' },
  { color: '#B8E0FF', label: 'Azul claro' },
] as const

/** Cores da referência da Bíblia (rodapé) — mesmas do APK. */
export const STAGE_REF_PRESETS = [
  { color: '#FCCE02', label: 'Dourado' },
  { color: '#FFFFFF', label: 'Branco' },
  { color: '#00C1E6', label: 'Ciano' },
  { color: '#FFE9A8', label: 'Amarelo suave' },
] as const

const WEIGHTS: StageFontWeight[] = [400, 600, 800]
const BIBLE_WEIGHTS: StageSettings['bibleFontWeight'][] = [400, 500, 700]

function asColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Parse do JSON no formato do APK. Chaves idênticas às do
 * StageSettingsRepository (bg/fg/size/weight/tsOn/tsBlur/tsInt/boxOn/
 * boxBg/boxBorder/tAlign/tVAlign/refColor/refWeight/showVer/bSize/
 * bWeight/bFg). O background (dataURL no web) vai em `bgImg`.
 */
export function parseStageSettings(raw: unknown): StageSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STAGE_SETTINGS }
  const s = raw as Record<string, unknown>
  const weight = asNumber(s['weight'], 600) as StageFontWeight
  const bibleWeight = asNumber(s['bWeight'], 500) as StageSettings['bibleFontWeight']
  return {
    backgroundColor: asColor(s['bg'], DEFAULT_STAGE_SETTINGS.backgroundColor),
    textColor: asColor(s['fg'], DEFAULT_STAGE_SETTINGS.textColor),
    fontSize: clamp(asNumber(s['size'], 96), 60, 160),
    fontWeight: WEIGHTS.includes(weight) ? weight : 600,
    margin: clamp(asNumber(s['margin'], 120), 0, 480),
    textShadow: typeof s['tsOn'] === 'boolean' ? s['tsOn'] : true,
    shadowBlur: clamp(asNumber(s['tsBlur'], 2.2), 0.5, 5),
    shadowIntensity: clamp(asNumber(s['tsInt'], 0.8), 0.2, 1),
    textBox: typeof s['boxOn'] === 'boolean' ? s['boxOn'] : DEFAULT_STAGE_SETTINGS.textBox,
    boxOpacity: clamp(asNumber(s['boxBg'], 0.45), 0.1, 0.9),
    boxBorder: typeof s['boxBorder'] === 'boolean' ? s['boxBorder'] : true,
    textAlign: s['tAlign'] === 'left' || s['tAlign'] === 'right' ? s['tAlign'] : 'center',
    textVerticalAlign:
      s['tVAlign'] === 'top' || s['tVAlign'] === 'bottom' ? s['tVAlign'] : 'middle',
    footerRefColor: asColor(s['refColor'], DEFAULT_STAGE_SETTINGS.footerRefColor),
    footerRefWeight: clamp(Math.round(asNumber(s['refWeight'], 600)), 100, 900),
    showBibleVersion: typeof s['showVer'] === 'boolean' ? s['showVer'] : true,
    bibleFontSize: clamp(asNumber(s['bSize'], 84), 50, 140),
    bibleFontWeight: BIBLE_WEIGHTS.includes(bibleWeight) ? bibleWeight : 500,
    bibleTextColor: asColor(s['bFg'], DEFAULT_STAGE_SETTINGS.bibleTextColor),
    titleFontSize:
      s['tSize'] == null ? null : clamp(asNumber(s['tSize'], 96), 60, 160),
    titleFontWeight: s['tWeight'] == null ? null : (WEIGHTS.includes(asNumber(s['tWeight'], 600) as StageFontWeight) ? (asNumber(s['tWeight'], 600) as StageFontWeight) : null),
    titleTextColor: s['tFg'] == null ? null : asColor(s['tFg'], DEFAULT_STAGE_SETTINGS.textColor),
    titleUpperCase: typeof s['tUpper'] === 'boolean' ? s['tUpper'] : false,
    titleTextShadow: typeof s['tsOnT'] === 'boolean' ? s['tsOnT'] : null,
    lyricFontSize:
      s['lSize'] == null ? null : clamp(asNumber(s['lSize'], 84), 60, 160),
    lyricFontWeight: s['lWeight'] == null ? null : (WEIGHTS.includes(asNumber(s['lWeight'], 600) as StageFontWeight) ? (asNumber(s['lWeight'], 600) as StageFontWeight) : null),
    lyricTextColor: s['lFg'] == null ? null : asColor(s['lFg'], DEFAULT_STAGE_SETTINGS.textColor),
    lyricUpperCase: typeof s['lUpper'] === 'boolean' ? s['lUpper'] : false,
    lyricTextShadow: typeof s['tsOnL'] === 'boolean' ? s['tsOnL'] : null,
    backgroundImage:
      typeof s['bgImg'] === 'string' &&
      (s['bgImg'].startsWith('data:') || s['bgImg'].startsWith(OFFICIAL_BG_PREFIX))
        ? s['bgImg']
        : null,
    ...(s['clock'] && typeof s['clock'] === 'object'
      ? {
          clock: {
            style: (s['clock'] as Record<string, unknown>)['style'] === 'analog' ? ('analog' as const) : ('digital' as const),
            showSeconds:
              (s['clock'] as Record<string, unknown>)['showSeconds'] === true,
            format24h:
              (s['clock'] as Record<string, unknown>)['format24h'] !== false,
          } satisfies StageSettings['clock'],
        }
      : {}),
    ...(s['timer'] && typeof s['timer'] === 'object'
      ? {
          timer: {
            timeFormat: TIMER_TIME_FORMAT_OPTIONS.includes(
              (s['timer'] as Record<string, unknown>)['timeFormat'] as NonNullable<StageSettings['timer']>['timeFormat'],
            )
              ? ((s['timer'] as Record<string, unknown>)['timeFormat'] as NonNullable<StageSettings['timer']>['timeFormat'])
              : DEFAULT_TIMER_MODULE_SETTINGS.timeFormat,
          } satisfies StageSettings['timer'],
        }
      : {}),
    ...(s['countdown'] && typeof s['countdown'] === 'object'
      ? {
          countdown: {
            timeFormat: COUNTDOWN_TIME_FORMAT_OPTIONS.includes(
              (s['countdown'] as Record<string, unknown>)['timeFormat'] as NonNullable<StageSettings['countdown']>['timeFormat'],
            )
              ? ((s['countdown'] as Record<string, unknown>)['timeFormat'] as NonNullable<StageSettings['countdown']>['timeFormat'])
              : DEFAULT_COUNTDOWN_MODULE_SETTINGS.timeFormat,
          } satisfies StageSettings['countdown'],
        }
      : {}),
    ...(s['random'] && typeof s['random'] === 'object'
      ? {
          random: {
            fontSizePc: clamp(
              asNumber((s['random'] as Record<string, unknown>)['fontSizePc'], 8),
              4,
              14,
            ),
            textTransform: RANDOM_TEXT_TRANSFORM_OPTIONS.includes(
              (s['random'] as Record<string, unknown>)['textTransform'] as NonNullable<StageSettings['random']>['textTransform'],
            )
              ? ((s['random'] as Record<string, unknown>)['textTransform'] as NonNullable<StageSettings['random']>['textTransform'])
              : 'none',
            animationSpeed: RANDOM_ANIMATION_SPEED_OPTIONS.includes(
              (s['random'] as Record<string, unknown>)['animationSpeed'] as NonNullable<StageSettings['random']>['animationSpeed'],
            )
              ? ((s['random'] as Record<string, unknown>)['animationSpeed'] as NonNullable<StageSettings['random']>['animationSpeed'])
              : 'normal',
          } satisfies StageSettings['random'],
        }
      : {}),
    ...(s['hymns'] && typeof s['hymns'] === 'object'
      ? {
          hymns: {
            overrideBg: (s['hymns'] as Record<string, unknown>)['overrideBg'] === true,
          } satisfies StageSettings['hymns'],
        }
      : {}),
  }
}

/** Serializa no formato do APK (simétrico ao parse). */
export function serializeStageSettings(s: StageSettings): Record<string, unknown> {
  return {
    bg: s.backgroundColor,
    fg: s.textColor,
    size: s.fontSize,
    weight: s.fontWeight,
    margin: s.margin,
    tsOn: s.textShadow,
    tsBlur: s.shadowBlur,
    tsInt: s.shadowIntensity,
    boxOn: s.textBox,
    boxBg: s.boxOpacity,
    boxBorder: s.boxBorder,
    tAlign: s.textAlign,
    tVAlign: s.textVerticalAlign,
    refColor: s.footerRefColor,
    refWeight: s.footerRefWeight,
    showVer: s.showBibleVersion,
    bSize: s.bibleFontSize,
    bWeight: s.bibleFontWeight,
    bFg: s.bibleTextColor,
    ...(s.titleFontSize != null ? { tSize: s.titleFontSize } : {}),
    ...(s.titleFontWeight != null ? { tWeight: s.titleFontWeight } : {}),
    ...(s.titleTextColor != null ? { tFg: s.titleTextColor } : {}),
    ...(s.titleUpperCase ? { tUpper: true } : {}),
    ...(s.titleTextShadow != null ? { tsOnT: s.titleTextShadow } : {}),
    ...(s.lyricFontSize != null ? { lSize: s.lyricFontSize } : {}),
    ...(s.lyricFontWeight != null ? { lWeight: s.lyricFontWeight } : {}),
    ...(s.lyricTextColor != null ? { lFg: s.lyricTextColor } : {}),
    ...(s.lyricUpperCase ? { lUpper: true } : {}),
    ...(s.lyricTextShadow != null ? { tsOnL: s.lyricTextShadow } : {}),
    bgImg: s.backgroundImage,
    ...(s.clock ? { clock: s.clock } : {}),
    ...(s.timer ? { timer: s.timer } : {}),
    ...(s.countdown ? { countdown: s.countdown } : {}),
    ...(s.random ? { random: s.random } : {}),
    ...(s.hymns ? { hymns: s.hymns } : {}),
  }
}
