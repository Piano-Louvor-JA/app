import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGE_SETTINGS, parseStageSettings, serializeStageSettings } from '../stage-settings'

describe('stage-settings bible reference customization', () => {
  it('round-trips rSize and rUpper, omitting null rSize', () => {
    const customized = {
      ...DEFAULT_STAGE_SETTINGS,
      refFontSize: 72,
      refTextTransform: 'capitalize' as const,
    }
    const serialized = serializeStageSettings(customized)

    expect(serialized['rSize']).toBe(72)
    expect(serialized['rUpper']).toBe('capitalize')
    expect(parseStageSettings(serialized)).toMatchObject({
      refFontSize: 72,
      refTextTransform: 'capitalize',
    })
    expect('rSize' in serializeStageSettings(DEFAULT_STAGE_SETTINGS)).toBe(false)
  })
})
