// @vitest-environment node
/** LibreOffice espelhado: monitor do slideshow, perfil próprio e fonte de captura. */
import { describe, expect, it } from 'vitest'

import {
  buildLibreOfficeProfileXcu,
  buildLibreOfficeShowArgs,
  libreOfficeScreenNumber,
  pickScreenSourceId,
  resolveAudienceDisplays,
  sameDisplay,
} from '../ipc/presentation-libreoffice-mirror.mjs'

const displays = [{ id: 10 }, { id: 20 }, { id: 30 }]

// Caso real (4 monitores, X11): ordem do Electron ≠ ordem do RandR/captura.
const realDisplays = [
  { id: 8565007717795156 }, // esquerda
  { id: 8564683172039765 }, // direita
  { id: 8565007717795158 }, // operador (primário)
  { id: 8565007717795159 }, // vertical
]
const realSources = [
  { id: 'screen:387:0', display_id: '1115981142' }, // operador
  { id: 'screen:386:0', display_id: '2987740245' },
  { id: 'screen:385:0', display_id: '1115981140' },
  { id: 'screen:388:0', display_id: '1115981143' },
]

describe('sameDisplay', () => {
  it('casa id inteiro ou os 32 bits baixos (X11)', () => {
    expect(sameDisplay('1115981140', 8565007717795156)).toBe(true)
    expect(sameDisplay('20', 20)).toBe(true)
    expect(sameDisplay('1115981142', 8565007717795156)).toBe(false)
    expect(sameDisplay(undefined, 20)).toBe(false)
  })
})

describe('libreOfficeScreenNumber', () => {
  it('Linux: usa a ordem do RandR (fontes de captura), nunca a do Electron', () => {
    const base = { platform: 'linux', displays: realDisplays, sources: realSources }
    expect(libreOfficeScreenNumber({ ...base, displayId: 8565007717795156 })).toBe(3)
    expect(libreOfficeScreenNumber({ ...base, displayId: 8564683172039765 })).toBe(2)
    expect(libreOfficeScreenNumber({ ...base, displayId: 8565007717795158 })).toBe(1)
  })

  it('Linux sem fonte que case: 0 (externo padrão), não chuta pela ordem', () => {
    expect(
      libreOfficeScreenNumber({ platform: 'linux', displays: realDisplays, sources: [], displayId: 8565007717795156 }),
    ).toBe(0)
  })

  it('Windows/macOS: ordem do Electron; desconhecido cai em 0', () => {
    const base = { platform: 'win32', displays, sources: [] }
    expect(libreOfficeScreenNumber({ ...base, displayId: 10 })).toBe(1)
    expect(libreOfficeScreenNumber({ ...base, displayId: 30 })).toBe(3)
    expect(libreOfficeScreenNumber({ ...base, displayId: 99 })).toBe(0)
  })
})

describe('buildLibreOfficeProfileXcu', () => {
  it('grava o monitor do slideshow, console em janela e sem dica do dia', () => {
    const xcu = buildLibreOfficeProfileXcu({ display: 2 })
    expect(xcu).toContain('oor:path="/org.openoffice.Office.Impress/Misc"')
    expect(xcu).toContain('<prop oor:name="Display" oor:op="fuse"><value>2</value></prop>')
    expect(xcu).toContain('<prop oor:name="ShowTipOfTheDay" oor:op="fuse"><value>false</value></prop>')
    expect(xcu).toContain(
      '<item oor:path="/org.openoffice.Office.Impress/Misc/Start"><prop oor:name="PresenterScreenFullScreen" oor:op="fuse"><value>false</value></prop></item>',
    )
  })

  it('valor inválido vira 0', () => {
    expect(buildLibreOfficeProfileXcu({ display: Number.NaN })).toContain('<value>0</value>')
  })
})

describe('buildLibreOfficeShowArgs', () => {
  it('perfil próprio em URL file:// e slideshow direto', () => {
    const args = buildLibreOfficeShowArgs({ profileDir: '/tmp/perfil lo', filePath: '/a/culto.odp' })
    expect(args[0]).toBe('-env:UserInstallation=file:///tmp/perfil%20lo')
    expect(args).toEqual(expect.arrayContaining(['--show', '--norestore', '--nologo']))
    expect(args.at(-1)).toBe('/a/culto.odp')
  })
})

describe('resolveAudienceDisplays', () => {
  it('mantém a ordem pedida, sem o operador, sem repetidos e sem ids inválidos', () => {
    expect(resolveAudienceDisplays(displays, 10, [30, 10, 20, 30, 'x', 99])).toEqual([
      { id: 30 },
      { id: 20 },
    ])
    expect(resolveAudienceDisplays(displays, 10, undefined)).toEqual([])
  })
})

describe('pickScreenSourceId', () => {
  it('casa pelo display_id real, mesmo com ordem diferente', () => {
    expect(pickScreenSourceId(realSources, 8565007717795156)).toBe('screen:385:0')
    expect(pickScreenSourceId(realSources, 8564683172039765)).toBe('screen:386:0')
  })

  it('sem casar devolve null (nunca espelha outra tela)', () => {
    expect(pickScreenSourceId([{ id: 'screen:0:0' }], 10)).toBeNull()
  })
})
