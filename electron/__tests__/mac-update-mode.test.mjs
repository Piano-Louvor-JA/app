// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { needsManualMacUpdate, macInstallerUrl } from '../mac-update-mode.mjs'

describe('atualização macOS sem certificado Apple', () => {
  it('usa instalador manual para assinatura ad-hoc ou assinatura ausente', () => {
    expect(needsManualMacUpdate('darwin', vi.fn(() => ({ status: 0, stderr: 'Signature=adhoc' })))).toBe(true)
    expect(needsManualMacUpdate('darwin', vi.fn(() => ({ status: 1, stderr: 'not signed' })))).toBe(true)
  })
  it('permite atualização nativa para Developer ID e não interfere no Windows', () => {
    expect(needsManualMacUpdate('darwin', vi.fn(() => ({ status: 0, stderr: 'Authority=Developer ID Application: Example (ABCDE)' })))).toBe(false)
    const run = vi.fn()
    expect(needsManualMacUpdate('win32', run)).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
  it('link do instalador só pode apontar para a release oficial com versão válida', () => {
    expect(macInstallerUrl('1.31.2')).toBe('https://github.com/Piano-Louvor-JA/app/releases/download/v1.31.2/LouvorJA-PIANO-1.31.2-universal.dmg')
    expect(macInstallerUrl('../../other')).toBeNull()
  })
})
