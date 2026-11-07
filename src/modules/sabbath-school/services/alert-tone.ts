import { resolveMediaUrl } from '@shared/services/workspace-api'

/**
 * Alertas sonoros para countdown/cronômetro.
 * Presets sintéticos (WebAudio): beep, chime, gong — sem asset externo.
 * Presets oficiais da Escola Sabatina (MP3 na pasta de mídia, por idioma):
 * abertura_es, 5min_es, 1min_es.
 * 'custom' = HTMLAudioElement fornecido pelo caller (upload do usuário via API).
 */
export const ALERT_PRESETS = {
  // Sintéticos (WebAudio)
  beep: { freq: 880, duration: 0.15, type: 'sine' as OscillatorType },
  chime: { freq: [1318.51, 1046.5], duration: 0.12, type: 'sine' as OscillatorType },
  gong: { freq: 220, duration: 1.0, type: 'sine' as OscillatorType },
  // Oficiais LouvorJA: Media/modulos/escola-sabatina/<idioma>/<arquivo>
  abertura_es: { file: 'abertura.mp3' },
  '5min_es': { file: '5minutos.mp3' },
  '1min_es': { file: '1minuto.mp3' },
} as const

export type AlertPresetKey = keyof typeof ALERT_PRESETS

// ── i18n dos áudios oficiais da Escola Sabatina (SPEC countdown-audio-i18n) ──
// Idioma EFETIVO da narração. 'fr' existe SÓ aqui — a UI não ganha locale FR.
export type SabbathAudioLang = 'pt-BR' | 'es' | 'en' | 'fr'
export type SabbathAudioLangSetting = SabbathAudioLang | 'auto'

const SABBATH_AUDIO_LANGS: readonly SabbathAudioLang[] = ['pt-BR', 'es', 'en', 'fr']

/** Locale de UI → idioma da narração; não mapeado → pt-BR. */
export function resolveSabbathSchoolAudioLang(
  setting: SabbathAudioLangSetting,
  uiLocale: string,
): SabbathAudioLang {
  const auto = SABBATH_AUDIO_LANGS.slice(0, 3).find((l) => l === uiLocale) ?? 'pt-BR'
  return SABBATH_AUDIO_LANGS.find((l) => l === setting) ?? auto
}

/** Pasta das narrações oficiais, relativa à pasta Media. */
export const SABBATH_AUDIO_REL_DIR = 'modulos/escola-sabatina'

const SABBATH_AUDIO_FOLDER: Record<SabbathAudioLang, string> = {
  'pt-BR': 'pt',
  es: 'es',
  en: 'en',
  fr: 'fr',
}

/** Manifesto: arquivo + duração ffprobe pré-medida (idêntica nos 4 idiomas). */
export const officialToneAssets = {
  abertura_es: { file: ALERT_PRESETS.abertura_es.file, durationMs: 30_400 },
  '5min_es': { file: ALERT_PRESETS['5min_es'].file, durationMs: 18_000 },
  '1min_es': { file: ALERT_PRESETS['1min_es'].file, durationMs: 65_500 },
} as const

export type OfficialToneKey = keyof typeof officialToneAssets

/** Asset efetivo (URL+duração) de uma faixa oficial no idioma dado. Idioma desconhecido → PT. */
export function resolveSabbathSchoolAudio(preset: AlertPresetKey, lang: string): { url: string; durationMs: number } {
  const track = officialToneAssets[preset as OfficialToneKey]
  if (!track) return { url: '', durationMs: 0 }
  const folder = SABBATH_AUDIO_FOLDER[lang as SabbathAudioLang] ?? SABBATH_AUDIO_FOLDER['pt-BR']
  return {
    url: resolveMediaUrl(`${SABBATH_AUDIO_REL_DIR}/${folder}/${track.file}`),
    durationMs: track.durationMs,
  }
}

/** Duração aproximada de cada preset de áudio, em ms.
 *  Sintéticos: duration (s). MP3 oficiais: metadados pré-medidos.
 *  Custom: estimativa conservadora (usuário pode carregar áudio longo). */
export function getPresetDurationMs(preset: AlertPresetKey | 'none' | 'custom', customAudio?: HTMLAudioElement | null, sabbathAudioLang?: SabbathAudioLang): number {
  if (preset === 'none') return 0
  if (preset === 'custom') return customAudio?.duration ? customAudio.duration * 1000 : 60_000
  const def = ALERT_PRESETS[preset]
  if ('duration' in def) return def.duration * 1000
  // MP3s oficiais medidos com ffprobe — durações idênticas nos 4 idiomas
  // (mix preso ao instrumental original)
  void sabbathAudioLang
  return officialToneAssets[preset as OfficialToneKey].durationMs
}

// ── Fila de alertas (feedback Ezequias 02/10: "adiciona queue") ──────────
// Dois marcos cruzando no mesmo tick (ex.: rAF congelado em janela em bg
// salta de 10min pra 1min de uma vez) tocavam SIMULTANEAMENTE. Agora:
// os disparos entram numa fila serial — cada áudio espera o anterior acabar.
let queueChain: Promise<void> = Promise.resolve()
let queueDropped = 0
let pendingCount = 0

/** Enfileira um disparo de alerta na ordem. Se a fila crescer demais
 *  (ex.: marcos acumulados por jump grande), descarta os excedentes
 *  mais antigos pra não tocar "atrasado" um alerta que já perdeu a hora. */
export function enqueueAlert(
  play: () => Promise<void>,
  opts: { maxPending?: number } = {},
): void {
  const maxPending = opts.maxPending ?? 2
  // mede pendências pela cadeia atual (chain de promessas pendentes)
  const pending = pendingCount
  if (pending >= maxPending) {
    queueDropped += 1
    return
  }
  pendingCount += 1
  queueChain = queueChain
    .then(play)
    .catch(() => {
      // erro num alerta não derruba os seguintes
    })
    .finally(() => {
      pendingCount -= 1
    })
}

/** Quantidade de alertas enfileirados aguardando (testes/telemetria). */
export function pendingAlertCount(): number {
  return pendingCount
}

/** Alertas descartados por excesso de fila desde o boot do módulo. */
export function droppedAlertCount(): number {
  return queueDropped
}

/** Esvazia a fila (Stop do operador também corta o que está na fila). */
export function clearAlertQueue(): void {
  queueChain = Promise.resolve()
  pendingCount = 0
}

// Cache de AudioContext e elementos de áudio pré-carregados
const audioCache = new Map<string, HTMLAudioElement>()

async function preloadAudio(url: string): Promise<HTMLAudioElement> {
  if (audioCache.has(url)) return audioCache.get(url)!
  const audio = new Audio(url)
  audio.preload = 'auto'
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener('canplaythrough', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
  })
  audioCache.set(url, audio)
  return audio
}

export async function playAlertTone(
  preset: AlertPresetKey | 'custom',
  ctx?: AudioContext,
  customAudio?: HTMLAudioElement,
  control?: { volume?: number; sabbathAudioLang?: SabbathAudioLang },
): Promise<HTMLAudioElement | undefined> {
  const volume = control?.volume ?? 1
  // Presets sintéticos usam WebAudio
  const syntheticKeys = ['beep', 'chime', 'gong'] as const
  const syntheticPreset = syntheticKeys.find((key) => key === preset)
    if (syntheticPreset != null) {
      if (!ctx) return
      const p = ALERT_PRESETS[syntheticPreset]
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = p.type
      // F2: volume do operador (0–1) escala o ganho fixo 0.3
      const baseGain = 0.3 * volume
      if (Array.isArray(p.freq)) {
        // chime: dois osciladores em sequência
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = p.type
        osc2.frequency.setValueAtTime(p.freq[0], ctx.currentTime)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        gain2.gain.setValueAtTime(baseGain, ctx.currentTime)
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.duration)
        osc2.start(ctx.currentTime)
        osc2.stop(ctx.currentTime + p.duration)
        // segundo tom
        osc.frequency.setValueAtTime(p.freq[1], ctx.currentTime + p.duration)
      } else {
        const singleFreq = Array.isArray(p.freq) ? p.freq[0] : p.freq
        osc.frequency.setValueAtTime(singleFreq, ctx.currentTime)
      }
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(baseGain, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + p.duration)
      return
    }

  // Presets MP3 (oficiais LouvorJA) + custom
  let audio: HTMLAudioElement | undefined
  if (preset === 'custom') {
    audio = customAudio
  } else {
    const { url } = resolveSabbathSchoolAudio(preset, control?.sabbathAudioLang ?? 'pt-BR')
    if (!url) return
    audio = await preloadAudio(url)
  }
  if (!audio) return
  try {
    audio.volume = volume
    audio.currentTime = 0
    registerActiveAudio(audio)
    await audio.play()
    return audio
  } catch {
    // autoplay bloqueado — silencioso
    return undefined
  }
}

// ── F2 (web#175): stop global — o operador corta o que estiver tocando ──
const activeAudios = new Set<HTMLAudioElement>()
const activeStopHooks = new Set<() => void>()

function registerActiveAudio(audio: HTMLAudioElement): void {
  activeAudios.add(audio)
  audio.addEventListener('ended', () => activeAudios.delete(audio), { once: true })
}

/** Registra hook de stop pra áudio sintético (WebAudio em curso). */
export function registerStopHook(hook: () => void): () => void {
  activeStopHooks.add(hook)
  return () => activeStopHooks.delete(hook)
}

/** Pausa (sem perder posição) todos os áudios ativos — retomável. */
export function pauseAllAlerts(): void {
  for (const audio of [...activeAudios]) {
    if (typeof audio.pause === 'function') audio.pause()
  }
  for (const hook of [...activeStopHooks]) hook()
}

/** Corta TUDO que está tocando agora (mute do operador / Stop) e
 *  rebobina pro início. */
export function stopAllAlerts(): void {
  for (const audio of [...activeAudios]) {
    if (typeof audio.pause === 'function') audio.pause()
    try { audio.currentTime = 0 } catch { /* some browsers */ }
    activeAudios.delete(audio)
  }
  for (const hook of [...activeStopHooks]) hook()
  activeStopHooks.clear()
}

/** Retoma áudios pausados pelo pauseAllAlerts (de onde pararam). */
export function resumeAllAlerts(): void {
  for (const audio of [...activeAudios]) {
    void audio.play().catch(() => {
      // autoplay bloqueado — silencioso
    })
  }
}

/** F2: aplica volume AO VIVO em tudo que está tocando agora. */
export function setLiveVolume(volume: number): void {
  const clamped = Math.min(1, Math.max(0, volume))
  for (const audio of [...activeAudios]) {
    if (typeof audio.volume === 'number') audio.volume = clamped
  }
}

// Exporta lista de presets para UI (sintéticos + oficiais + desabilitado)
export function getAvailablePresets(): Array<{ key: string; label: string }> {
  return [
    { key: 'none', label: '— Desabilitado —' },
    { key: 'abertura_es', label: 'Abertura ES (oficial LouvorJA)' },
    { key: '5min_es', label: '5 min ES (oficial LouvorJA)' },
    { key: '1min_es', label: '1 min ES (oficial LouvorJA)' },
    { key: 'beep', label: 'Beep (sintético)' },
    { key: 'chime', label: 'Chime (sintético)' },
    { key: 'gong', label: 'Gong (sintético)' },
    { key: 'custom', label: 'Áudio personalizado do dispositivo' },
  ]
}

// ── Áudio personalizado do usuário (por marco) ─────────────────────────
// Persistido em localStorage como data-URL (arquivos de alerta são pequenos, <2MB razoável).
const CUSTOM_TONES_KEY = 'pianolouvorja:countdown:customTones'
/** Chave legada exposta pra migração (store limpa após importar). */
export const LEGACY_CUSTOM_TONES_KEY = CUSTOM_TONES_KEY

export type CustomToneMap = Partial<Record<'start' | '5min' | '1min', string>> // data-URLs

export function loadCustomTones(): CustomToneMap {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TONES_KEY) ?? '{}') as CustomToneMap
  } catch {
    return {}
  }
}

export function saveCustomTone(marker: 'start' | '5min' | '1min', dataUrl: string): void {
  const tones = loadCustomTones()
  tones[marker] = dataUrl
  try {
    localStorage.setItem(CUSTOM_TONES_KEY, JSON.stringify(tones))
  } catch {
    // quota excedida — arquivo grande demais
    throw new Error('TOO_LARGE')
  }
}

export function clearCustomTone(marker: 'start' | '5min' | '1min'): void {
  const tones = loadCustomTones()
  delete tones[marker]
  localStorage.setItem(CUSTOM_TONES_KEY, JSON.stringify(tones))
}

// Cache de HTMLAudioElement por data-URL custom
const customAudioCache = new Map<string, HTMLAudioElement>()

/** Retorna o HTMLAudioElement custom do marco, ou undefined se não há. */
export function getCustomAudio(marker: 'start' | '5min' | '1min'): HTMLAudioElement | undefined {
  const dataUrl = loadCustomTones()[marker]
  if (!dataUrl) return undefined
  let audio = customAudioCache.get(dataUrl)
  if (!audio) {
    audio = new Audio(dataUrl)
    audio.preload = 'auto'
    customAudioCache.set(dataUrl, audio)
  }
  return audio
}