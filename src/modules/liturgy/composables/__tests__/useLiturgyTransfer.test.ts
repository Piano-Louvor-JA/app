// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildLiturgyExport } from '../../services/liturgy-transfer'
import { normalizeLiturgyState } from '../../services/liturgy-preferences'
import { useLiturgyTransfer } from '../useLiturgyTransfer'

const exported = buildLiturgyExport(normalizeLiturgyState(null), new Date('2026-11-25T10:00:00Z'))

function fileWith(text: string) {
  return { text: async () => text } as unknown as File
}

function setup(hasContent: boolean) {
  const importLiturgy = vi.fn()
  const transfer = useLiturgyTransfer({
    exportLiturgy: () => exported,
    importLiturgy,
    hasContent: () => hasContent,
  })
  return { transfer, importLiturgy }
}

describe('useLiturgyTransfer', () => {
  let created: string[] = []
  beforeEach(() => {
    created = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      created.push(this.download)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exportar baixa liturgia-AAAA-MM-DD.json', () => {
    const { transfer } = setup(false)
    transfer.exportFile(new Date('2026-11-25T10:00:00Z'))
    expect(created).toEqual(['liturgia-2026-11-25.json'])
    expect(transfer.messageKey.value).toBe('liturgy.transfer.exported')
  })

  it('semana vazia: importa direto (substituindo), sem perguntar', async () => {
    const { transfer, importLiturgy } = setup(false)
    await transfer.importFile(fileWith(JSON.stringify(exported)))
    expect(transfer.confirmOpen.value).toBe(false)
    expect(importLiturgy).toHaveBeenCalledWith(exported, 'replace')
    expect(transfer.messageKey.value).toBe('liturgy.transfer.imported')
  })

  it('semana com itens: pergunta; substituir, acrescentar ou cancelar', async () => {
    const { transfer, importLiturgy } = setup(true)
    await transfer.importFile(fileWith(JSON.stringify(exported)))
    expect(transfer.confirmOpen.value).toBe(true)
    expect(importLiturgy).not.toHaveBeenCalled()
    transfer.confirm('append')
    expect(importLiturgy).toHaveBeenLastCalledWith(exported, 'append')
    expect(transfer.confirmOpen.value).toBe(false)

    await transfer.importFile(fileWith(JSON.stringify(exported)))
    transfer.confirm('replace')
    expect(importLiturgy).toHaveBeenLastCalledWith(exported, 'replace')

    await transfer.importFile(fileWith(JSON.stringify(exported)))
    transfer.cancel()
    expect(importLiturgy).toHaveBeenCalledTimes(2)
    expect(transfer.confirmOpen.value).toBe(false)
  })

  it('arquivo inválido ou de versão nova: avisa e não importa', async () => {
    const { transfer, importLiturgy } = setup(false)
    await transfer.importFile(fileWith('lixo'))
    expect(transfer.messageKey.value).toBe('liturgy.transfer.invalid')
    await transfer.importFile(fileWith(JSON.stringify({ ...exported, version: 99 })))
    expect(transfer.messageKey.value).toBe('liturgy.transfer.version')
    expect(importLiturgy).not.toHaveBeenCalled()
  })
})
