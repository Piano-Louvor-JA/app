import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, ipcMain: {}, screen: {} }))
vi.mock('qrcode', () => ({ default: { toDataURL: async () => '' } }))

const {
  phoneCandidates,
  reachablePhoneHost,
  receiverQuery,
  sanitizeShareModes,
  shareableDisplays,
  validPhoneHost,
} = await import('../monitor-share.mjs')

describe('Compartilhar monitores com o app mobile', () => {
  const four = [{ id: 11 }, { id: 22 }, { id: 33 }, { id: 44 }]

  it('nunca oferece o monitor principal (do sonoplasta)', () => {
    const list = shareableDisplays(four, 33)
    expect(list.map((d) => d.display.id)).toEqual([11, 22, 44])
    // Mantém a numeração do sistema (Monitor 3 = principal fica de fora).
    expect(list.map((d) => d.label)).toEqual(['Monitor 1', 'Monitor 2', 'Monitor 4'])
  })

  it('com um monitor só não há nada para compartilhar', () => {
    expect(shareableDisplays([{ id: 1 }], 1)).toEqual([])
  })

  it('descarta escolha salva do principal ou de monitor que saiu', () => {
    const saved = { 11: 'mirror', 33: 'mirror', 44: 'return', 99: 'mirror', 22: 'bogus' }
    expect(sanitizeShareModes(saved, [11, 22, 44])).toEqual({ 11: 'mirror', 44: 'return' })
  })

  it('janela sempre sem som; retorno vira ?mode=retorno', () => {
    expect(receiverQuery('192.168.0.50', 4981, 'mirror')).toEqual({ host: '192.168.0.50', port: '4981', mute: '1' })
    expect(receiverQuery('192.168.0.50', 4981, 'return')).toMatchObject({ mute: '1', mode: 'retorno' })
  })

  it('aceita IPv4 de qualquer faixa, mas não formatos estranhos', () => {
    expect(validPhoneHost('100.64.0.7')).toBe('100.64.0.7')
    for (const bad of ['0.0.0.0', '224.0.0.1', '127.1', 'evil.example', '192.168.1.2/x']) {
      expect(validPhoneHost(bad)).toBeNull()
    }
  })
  it('usa o endereço do celular que responde: informado, origem do pedido, máquina', async () => {
    expect(phoneCandidates('10.0.2.16', '::ffff:192.168.0.130')).toEqual(['10.0.2.16', '192.168.0.130', '127.0.0.1'])
    const only = (ok) => async (host) => host === ok
    expect(await reachablePhoneHost('10.0.2.16', '192.168.0.130', 4981, only('127.0.0.1'))).toBe('127.0.0.1')
    expect(await reachablePhoneHost('192.168.0.50', '192.168.0.50', 4981, only('192.168.0.50'))).toBe('192.168.0.50')
    // Ninguém responde: mantém o informado (o celular pode subir depois).
    expect(await reachablePhoneHost('192.168.0.50', null, 4981, only('x'))).toBe('192.168.0.50')
  })
})
