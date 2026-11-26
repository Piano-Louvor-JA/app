// @vitest-environment node
/** App custom de apresentação: abrir já em modo slideshow quando reconhecido. */
import { describe, expect, it } from 'vitest'

import { slideshowArgsForBinary } from '../ipc/presentation-external.mjs'

describe('slideshowArgsForBinary', () => {
  it('LibreOffice recebe --show', () => {
    expect(slideshowArgsForBinary('/usr/bin/soffice')).toBe('--show --norestore --nologo ')
    expect(slideshowArgsForBinary('/opt/libreoffice/program/libreoffice')).toContain('--show')
    expect(slideshowArgsForBinary('/usr/bin/simpress')).toContain('--show')
  })

  it('app desconhecido não recebe argumento', () => {
    expect(slideshowArgsForBinary('/usr/bin/meu-app')).toBe('')
    expect(slideshowArgsForBinary('')).toBe('')
  })

  it('PowerPoint recebe /S só no Windows', () => {
    const expected = process.platform === 'win32' ? '/S ' : ''
    expect(slideshowArgsForBinary('C:\\\\Office\\\\POWERPNT.EXE')).toBe(expected)
  })
})
