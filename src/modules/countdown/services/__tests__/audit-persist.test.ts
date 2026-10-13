import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})

import {
  loadCountdownDisplayConfig,
  saveCountdownDisplayConfig,
} from '../countdown-preferences'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG } from '../../types/countdown'

describe('audit — persistência da config display', () => {
  beforeEach(() => localStorage.clear())

  it('salva e recarrega alertTonePresets + mode + sabbathConfig sem perda', () => {
    saveCountdownDisplayConfig({
      ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
      allowNegative: true,
      mode: 'sabbath',
      sabbathConfig: { scheduleMode: 'start', endTime: '11:30', startTime: '09:00' },
      alertTonePresets: { start: 'gong', '5min': 'chime', '1min': 'beep' },
    })
    const loaded = loadCountdownDisplayConfig()
    expect(loaded.mode).toBe('sabbath')
    expect(loaded.alertTonePresets?.start).toBe('gong')
    expect(loaded.sabbathConfig?.endTime).toBe('11:30')
  })
})
