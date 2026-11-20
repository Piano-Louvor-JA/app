/** Mudo e volume dos alertas do cronômetro, lembrados entre sessões. */

export interface SabbathSchoolAudioPreferences {
  muted: boolean
  volume: number
}

export const SABBATH_SCHOOL_AUDIO_STORAGE_KEY = 'pianolouvorja:countdown:audioControl'
/** O vídeo personalizado tem altura própria, diferente das narrações. */
export const SABBATH_SCHOOL_VIDEO_AUDIO_STORAGE_KEY = 'pianolouvorja:sabbathSchool:videoAudio'

function readPreferences(key: string): SabbathSchoolAudioPreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SabbathSchoolAudioPreferences> | null
    if (raw && typeof raw === 'object') {
      return {
        muted: raw.muted === true,
        volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : 1,
      }
    }
  } catch {
    // storage corrompido — defaults
  }
  return { muted: false, volume: 1 }
}

function savePreferences(key: string, preferences: SabbathSchoolAudioPreferences): void {
  try {
    localStorage.setItem(key, JSON.stringify(preferences))
  } catch {
    // storage indisponível — vale só nesta sessão
  }
}

export function readAudioPreferences(): SabbathSchoolAudioPreferences {
  return readPreferences(SABBATH_SCHOOL_AUDIO_STORAGE_KEY)
}

export function saveAudioPreferences(preferences: SabbathSchoolAudioPreferences): void {
  savePreferences(SABBATH_SCHOOL_AUDIO_STORAGE_KEY, preferences)
}

export function readVideoAudioPreferences(): SabbathSchoolAudioPreferences {
  return readPreferences(SABBATH_SCHOOL_VIDEO_AUDIO_STORAGE_KEY)
}

export function saveVideoAudioPreferences(preferences: SabbathSchoolAudioPreferences): void {
  savePreferences(SABBATH_SCHOOL_VIDEO_AUDIO_STORAGE_KEY, preferences)
}
