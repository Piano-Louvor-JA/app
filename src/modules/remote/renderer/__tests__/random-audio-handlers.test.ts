import { describe, expect, it, vi } from 'vitest'
import { createModuleHandlers } from '../module-handlers'
function setup() {
  const random = { config: { value: { audioSource: 'custom', audioVolume: 0.45, audioMuted: true, customAudioFile: 'Som.mp3', customAudioFiles: ['Som.mp3'] } }, audioPlaying: { value: true }, useDefaultDrawAudio: vi.fn(async () => {}), useCustomDrawAudio: vi.fn(), togglePreviewDrawAudio: vi.fn(), setAudioVolume: vi.fn(), toggleAudioMuted: vi.fn() }
  return { random, handler: createModuleHandlers({ random } as never) }
}
describe('áudio do sorteio remoto', () => {
  it('espelha configuração real e estado de reprodução', () => {
    const { handler } = setup()
    expect(handler.snapshot('random')).toMatchObject({ audioSource: 'custom', audioVolume: 45, audioMuted: true, audioPlaying: true, customAudioFile: 'Som.mp3', customAudioFiles: ['Som.mp3'] })
  })
  it('ajusta volume e valida limites antes de chamar o store', async () => {
    const { handler, random } = setup()
    expect(await handler.execute('random', 'random.setAudioVolume', { value: 70 })).toBe(true)
    expect(random.setAudioVolume).toHaveBeenCalledWith(0.7)
    expect(await handler.execute('random', 'random.setAudioVolume', { value: 150 })).toBe(false)
    expect(await handler.execute('random', 'random.setAudioVolume', { value: NaN })).toBe(false)
  })
  it('controla áudio e permite escolher apenas arquivos existentes', async () => {
    const { handler, random } = setup()
    for (const action of ['random.toggleAudio', 'random.toggleAudioMute', 'random.useDefaultAudio']) expect(await handler.execute('random', action, {})).toBe(true)
    expect(random.togglePreviewDrawAudio).toHaveBeenCalledOnce()
    expect(random.toggleAudioMuted).toHaveBeenCalledOnce()
    expect(random.useDefaultDrawAudio).toHaveBeenCalledOnce()
    expect(await handler.execute('random', 'random.useCustomAudio', { name: 'Som.mp3' })).toBe(true)
    expect(random.useCustomDrawAudio).toHaveBeenCalledWith('Som.mp3')
    expect(await handler.execute('random', 'random.useCustomAudio', { name: 'outro.mp3' })).toBe(false)
  })
})
