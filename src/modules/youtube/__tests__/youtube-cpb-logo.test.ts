import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ channelLogo: vi.fn() }))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => ({ ytSearch: { channelLogo: mocks.channelLogo } }),
}))

import { cachedCpbLogo, refreshCpbLogo, resetCpbLogoSession } from '../services/youtube-cpb-logo'

const LOGO = 'data:image/jpeg;base64,/9j/AAAA'

describe('logo da Casa Publicadora Brasileira', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.channelLogo.mockReset()
    resetCpbLogoSession()
  })

  it('pede ao app a foto oficial do canal como imagem embutida e guarda (aparece sem internet)', async () => {
    mocks.channelLogo.mockResolvedValue({ dataUrl: LOGO })
    expect(cachedCpbLogo()).toBe('')
    expect(await refreshCpbLogo()).toBe(LOGO)
    expect(mocks.channelLogo).toHaveBeenCalledWith('https://www.youtube.com/@casapublicadora')
    expect(cachedCpbLogo()).toBe(LOGO)
  })

  it('sem internet ou sem foto, mantém o que já estava guardado', async () => {
    mocks.channelLogo.mockResolvedValue({ dataUrl: LOGO })
    await refreshCpbLogo()
    resetCpbLogoSession()
    mocks.channelLogo.mockResolvedValue({ dataUrl: '', error: 'network' })
    expect(await refreshCpbLogo()).toBe(LOGO)
    resetCpbLogoSession()
    mocks.channelLogo.mockRejectedValue(new Error('offline'))
    expect(await refreshCpbLogo()).toBe(LOGO)
  })

  it('com logo guardado, busca só uma vez por sessão', async () => {
    mocks.channelLogo.mockResolvedValue({ dataUrl: LOGO })
    await refreshCpbLogo()
    await refreshCpbLogo()
    await refreshCpbLogo()
    expect(mocks.channelLogo).toHaveBeenCalledTimes(1)
  })

  it('só aceita imagem embutida (nada de endereço qualquer)', async () => {
    mocks.channelLogo.mockResolvedValue({ dataUrl: 'javascript:alert(1)' })
    expect(await refreshCpbLogo()).toBe('')
  })
})
