// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  enableReturnScreen,
  loadProjectionSettings,
  normalizeProjectionSettings,
  pickDefaultReturnDisplayId,
  pruneReturnDisplay,
  readImageAsDataUrl,
  reconcileTargetDisplays,
  resolveReturnMonitorId,
  resolveSelectedReturnMonitorId,
  saveProjectionSettings,
  setReturnDisplayId,
  toggleTargetDisplay,
} from '../services/projection-preferences'
import { DEFAULT_PROJECTION_SETTINGS } from '../types/projection'

const DISPLAYS = [
  { id: 1, isPrimary: true },
  { id: 2, isPrimary: false },
  { id: 3, isPrimary: false },
]

describe('projection-preferences — tela de retorno', () => {
  it('normalize lê openReturnScreen e returnDisplayId', () => {
    const settings = normalizeProjectionSettings({
      ...DEFAULT_PROJECTION_SETTINGS,
      openReturnScreen: true,
      returnDisplayId: 7,
    })
    expect(settings.openReturnScreen).toBe(true)
    expect(settings.returnDisplayId).toBe(7)
  })

  it('normalize ignora returnDisplayId inválido', () => {
    const settings = normalizeProjectionSettings({
      returnDisplayId: '2',
      openReturnScreen: 'yes',
    })
    expect(settings.returnDisplayId).toBeNull()
    expect(settings.openReturnScreen).toBe(false)
  })

  it('setReturnDisplayId não tira o monitor da audiência', () => {
    const next = setReturnDisplayId(
      {
        ...DEFAULT_PROJECTION_SETTINGS,
        targetDisplayIds: [2, 3],
        declinedDisplayIds: [],
      },
      2,
    )
    expect(next.returnDisplayId).toBe(2)
    expect(next.targetDisplayIds).toEqual([2, 3])
    expect(next.declinedDisplayIds).toEqual([])
  })

  it('toggle da audiência no monitor de retorno mantém returnDisplayId', () => {
    const next = toggleTargetDisplay(
      {
        ...DEFAULT_PROJECTION_SETTINGS,
        targetDisplayIds: [3],
        declinedDisplayIds: [2],
        returnDisplayId: 2,
        openReturnScreen: true,
      },
      2,
    )
    expect(next.targetDisplayIds).toEqual([3, 2])
    expect(next.returnDisplayId).toBe(2)
    expect(next.openReturnScreen).toBe(true)
  })

  it('reconcile também inclui o monitor de retorno na audiência', () => {
    const next = reconcileTargetDisplays(
      {
        ...DEFAULT_PROJECTION_SETTINGS,
        targetDisplayIds: [],
        declinedDisplayIds: [],
        openReturnScreen: true,
        returnDisplayId: 2,
      },
      [2, 3],
    )
    expect(next.targetDisplayIds).toEqual([2, 3])
    expect(next.returnDisplayId).toBe(2)
  })

  it('pickDefaultReturnDisplayId prefere estendido livre', () => {
    const id = pickDefaultReturnDisplayId(
      {
        ...DEFAULT_PROJECTION_SETTINGS,
        targetDisplayIds: [2],
      },
      DISPLAYS,
    )
    expect(id).toBe(3)
  })

  it('enableReturnScreen escolhe monitor quando ainda não há um', () => {
    const next = enableReturnScreen(
      { ...DEFAULT_PROJECTION_SETTINGS },
      DISPLAYS,
    )
    expect(next.openReturnScreen).toBe(true)
    expect(next.returnDisplayId).toBe(2)
  })

  it('enableReturnScreen mantém o toggle ligado se ainda não há monitores', () => {
    const next = enableReturnScreen(
      { ...DEFAULT_PROJECTION_SETTINGS },
      [],
    )
    expect(next.openReturnScreen).toBe(true)
    expect(next.returnDisplayId).toBeNull()
  })

  it('resolveReturnMonitorId só vale com toggle ligado e monitor presente', () => {
    const settings = {
      ...DEFAULT_PROJECTION_SETTINGS,
      openReturnScreen: true,
      returnDisplayId: 2,
    }
    expect(resolveReturnMonitorId(settings, [1, 2])).toBe(2)
    expect(resolveReturnMonitorId({ ...settings, openReturnScreen: false }, [1, 2])).toBeNull()
    expect(resolveReturnMonitorId(settings, [1])).toBeNull()
  })

  it('resolveSelectedReturnMonitorId some se o monitor não está marcado', () => {
    const settings = {
      ...DEFAULT_PROJECTION_SETTINGS,
      openReturnScreen: true,
      returnDisplayId: 4,
    }
    expect(resolveSelectedReturnMonitorId(settings, [1, 2, 4], [1, 2, 4])).toBe(4)
    expect(resolveSelectedReturnMonitorId(settings, [1, 2, 4], [1, 2])).toBeNull()
  })

  it('pruneReturnDisplay desliga se o monitor sumiu', () => {
    const next = pruneReturnDisplay(
      {
        ...DEFAULT_PROJECTION_SETTINGS,
        openReturnScreen: true,
        returnDisplayId: 9,
      },
      [1, 2],
    )
    expect(next.returnDisplayId).toBeNull()
    expect(next.openReturnScreen).toBe(false)
  })
})

describe('projection-preferences — gaps de normalização e utilitários', () => {
  it('asNumberArray descarta não-números; asArrangement valida slots', () => {
    const settings = normalizeProjectionSettings({
      targetDisplayIds: [1, 'x', null, 2],
      declinedDisplayIds: 'nope',
      monitorArrangement: [
        { displayId: 1, x: 0, y: 0 },
        null,
        'x',
        { displayId: 'bad', x: 0, y: 0 },
        { displayId: 2, x: 'bad', y: 0 },
        { displayId: 2, x: 10, y: 'bad' },
        { displayId: 2, x: 10, y: 20 },
        { displayId: Number.NaN, x: 1, y: 2 },
      ],
    })
    expect(settings.targetDisplayIds).toEqual([1, 2])
    expect(settings.declinedDisplayIds).toEqual([])
    expect(settings.monitorArrangement).toEqual([
      { displayId: 1, x: 0, y: 0 },
      { displayId: 2, x: 10, y: 20 },
    ])
  })

  it('normalize: obj nulo, defaults de tipos errados e clamps', () => {
    expect(normalizeProjectionSettings(null)).toEqual(DEFAULT_PROJECTION_SETTINGS)
    expect(normalizeProjectionSettings(42)).toEqual(DEFAULT_PROJECTION_SETTINGS)
    const s = normalizeProjectionSettings({
      openFullscreenOnPrimary: 'yes',
      disablePrimaryWhenExtended: 1,
      autoMinimizePlayer: {},
      openReturnScreen: 'true',
      returnDisplayId: Number.POSITIVE_INFINITY,
      lyricAlign: 'diagonal',
      showSongTitle: 'no',
      customTextFormat: 0,
      customBackground: [],
      fontSizePercent: 9999,
      fontColor: 5,
      fontWeight: '800',
      backgroundColor: false,
      backgroundImage: 123,
      backgroundOpacity: -50,
    })
    expect(s.openFullscreenOnPrimary).toBe(DEFAULT_PROJECTION_SETTINGS.openFullscreenOnPrimary)
    expect(s.disablePrimaryWhenExtended).toBe(DEFAULT_PROJECTION_SETTINGS.disablePrimaryWhenExtended)
    expect(s.autoMinimizePlayer).toBe(DEFAULT_PROJECTION_SETTINGS.autoMinimizePlayer)
    expect(s.openReturnScreen).toBe(DEFAULT_PROJECTION_SETTINGS.openReturnScreen)
    expect(s.returnDisplayId).toBeNull()
    expect(s.lyricAlign).toBe(DEFAULT_PROJECTION_SETTINGS.lyricAlign)
    expect(s.showSongTitle).toBe(DEFAULT_PROJECTION_SETTINGS.showSongTitle)
    expect(s.customTextFormat).toBe(DEFAULT_PROJECTION_SETTINGS.customTextFormat)
    expect(s.customBackground).toBe(DEFAULT_PROJECTION_SETTINGS.customBackground)
    expect(s.fontSizePercent).toBe(200)
    expect(s.fontColor).toBe(DEFAULT_PROJECTION_SETTINGS.fontColor)
    expect(s.fontWeight).toBe(DEFAULT_PROJECTION_SETTINGS.fontWeight)
    expect(s.backgroundColor).toBe(DEFAULT_PROJECTION_SETTINGS.backgroundColor)
    expect(s.backgroundImage).toBeNull()
    expect(s.backgroundOpacity).toBe(0)
    // clamps inferiores
    const s2 = normalizeProjectionSettings({ fontSizePercent: 1, backgroundOpacity: 500 })
    expect(s2.fontSizePercent).toBe(50)
    expect(s2.backgroundOpacity).toBe(100)
  })

  it('align legado Cima/Centro/Baixo e fontWeight válido', () => {
    expect(normalizeProjectionSettings({ lyricAlign: 'Cima' }).lyricAlign).toBe('top')
    expect(normalizeProjectionSettings({ lyricAlign: 'Centro' }).lyricAlign).toBe('center')
    expect(normalizeProjectionSettings({ lyricAlign: 'Baixo' }).lyricAlign).toBe('bottom')
    expect(normalizeProjectionSettings({ fontWeight: '900' }).fontWeight).toBe('900')
    expect(normalizeProjectionSettings({ fontWeight: '600' }).fontWeight).toBe('600')
    expect(normalizeProjectionSettings({ fontWeight: '400' }).fontWeight).toBe('400')
  })

  it('loadProjectionSettings + saveProjectionSettings persistem', () => {
    saveProjectionSettings({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: true })
    expect(loadProjectionSettings().openReturnScreen).toBe(true)
    saveProjectionSettings(DEFAULT_PROJECTION_SETTINGS)
  })

  it('reconcileTargetDisplays: sem mudanças retorna a MESMA ref; novas telas entram; declined saem', () => {
    const base = { ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [2], declinedDisplayIds: [3] }
    expect(reconcileTargetDisplays(base, [2, 3])).toBe(base)
    const added = reconcileTargetDisplays(base, [2, 3, 4])
    expect(added.targetDisplayIds).toEqual([2, 4])
    expect(added.declinedDisplayIds).toEqual([3])
    // monitor sumiu da lista: alvo e declined filtrados
    const gone = reconcileTargetDisplays({ ...base, targetDisplayIds: [9, 2] }, [2])
    expect(gone.targetDisplayIds).toEqual([2])
  })

  it('toggleTargetDisplay: desmarcar adiciona declined 1x; desmarcado de novo não duplica', () => {
    const base = { ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [2], declinedDisplayIds: [] }
    const off = toggleTargetDisplay(base, 2)
    expect(off.targetDisplayIds).toEqual([])
    expect(off.declinedDisplayIds).toEqual([2])
    // já declined (estado legado) e ainda alvo: mantém declined sem duplicar
    const legacy = { ...base, targetDisplayIds: [2], declinedDisplayIds: [2] }
    const offLegacy = toggleTargetDisplay(legacy, 2)
    expect(offLegacy.targetDisplayIds).toEqual([])
    expect(offLegacy.declinedDisplayIds).toEqual([2])
    const on = toggleTargetDisplay(off, 2)
    expect(on.targetDisplayIds).toEqual([2])
    expect(on.declinedDisplayIds).toEqual([])
  })

  it('setReturnDisplayId(null) limpa; pickDefaultReturnDisplayId: sem estendidos usa primária; lista vazia null', () => {
    // setReturn com declined de OUTRO monitor: filtra só o escolhido
    const withDeclined = { ...DEFAULT_PROJECTION_SETTINGS, declinedDisplayIds: [2, 3] }
    const set3 = setReturnDisplayId(withDeclined, 3)
    expect(set3.declinedDisplayIds).toEqual([2])
    expect(set3.targetDisplayIds).toContain(3)
    expect(setReturnDisplayId(DEFAULT_PROJECTION_SETTINGS, null).returnDisplayId).toBeNull()
    expect(pickDefaultReturnDisplayId(DEFAULT_PROJECTION_SETTINGS, [])).toBeNull()
    expect(pickDefaultReturnDisplayId(DEFAULT_PROJECTION_SETTINGS, [{ id: 1, isPrimary: true }])).toBe(1)
    // estendido ocupado: cai no primeiro estendido
    const busy = { ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [2, 3] }
    expect(pickDefaultReturnDisplayId(busy, DISPLAYS)).toBe(2)
    // sem primária marcada: displays[0]
    expect(pickDefaultReturnDisplayId(DEFAULT_PROJECTION_SETTINGS, [{ id: 5, isPrimary: false }])).toBe(5)
    expect(normalizeProjectionSettings({ backgroundImage: 'data:image/png;base64,x' }).backgroundImage).toBe('data:image/png;base64,x')
  })

  it('enableReturnScreen: mantém id válido (reconcilia audiência); sem pick → null', () => {
    const withReturn = { ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: false, returnDisplayId: 3, targetDisplayIds: [2] }
    const kept = enableReturnScreen(withReturn, DISPLAYS)
    expect(kept.openReturnScreen).toBe(true)
    expect(kept.returnDisplayId).toBe(3)
    expect(kept.targetDisplayIds).toContain(3)
    // sem monitores: picked null
    const empty = enableReturnScreen({ ...withReturn, returnDisplayId: null }, [])
    expect(empty.returnDisplayId).toBeNull()
    expect(empty.openReturnScreen).toBe(true)
  })

  it('resolveReturnMonitorId: id ausente/fora da lista → null; resolveSelected idem', () => {
    expect(resolveReturnMonitorId({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: true, returnDisplayId: null }, [1])).toBeNull()
    expect(resolveReturnMonitorId({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: true, returnDisplayId: 9 }, [1])).toBeNull()
    expect(resolveSelectedReturnMonitorId({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: false, returnDisplayId: 1 }, [1], [1])).toBeNull()
    expect(resolveSelectedReturnMonitorId({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: true, returnDisplayId: 1 }, [1], [2])).toBeNull()
    expect(resolveSelectedReturnMonitorId({ ...DEFAULT_PROJECTION_SETTINGS, openReturnScreen: true, returnDisplayId: 1 }, [1], [1, 2])).toBe(1)
  })

  it('pruneReturnDisplay: sem id e id válido mantém settings', () => {
    expect(pruneReturnDisplay(DEFAULT_PROJECTION_SETTINGS, [1])).toBe(DEFAULT_PROJECTION_SETTINGS)
    const withReturn = { ...DEFAULT_PROJECTION_SETTINGS, returnDisplayId: 1, openReturnScreen: true }
    expect(pruneReturnDisplay(withReturn, [1, 2])).toBe(withReturn)
  })

  it('readImageAsDataUrl: resolve string e rejeita não-string/erro', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' })
    const file = new File([blob], 'a.png', { type: 'image/png' })
    const result = await readImageAsDataUrl(file)
    expect(typeof result).toBe('string')
    // não-string: reader.result arraybuffer
    const abFile = new File([new Uint8Array([1]).buffer], 'b.bin')
    const OriginalRead = FileReader.prototype.readAsDataURL
    FileReader.prototype.readAsDataURL = function (this: FileReader, _b: Blob) {
      Object.defineProperty(this, 'result', { value: new ArrayBuffer(2), configurable: true })
      this.onload?.(null as never)
    } as typeof FileReader.prototype.readAsDataURL
    await expect(readImageAsDataUrl(abFile)).rejects.toThrow('invalid image result')
    FileReader.prototype.readAsDataURL = OriginalRead
    // onerror
    const errFile = new File([blob], 'c.png')
    FileReader.prototype.readAsDataURL = function (this: FileReader, _b: Blob) {
      this.onerror?.(new ProgressEvent('error'))
    } as typeof FileReader.prototype.readAsDataURL
    await expect(readImageAsDataUrl(errFile)).rejects.toThrow()
    FileReader.prototype.readAsDataURL = OriginalRead
  })
})
