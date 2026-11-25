// File: src/modules/libras/__tests__/libras-avatar.test.ts
// SPDX-License-Identifier: MIT
// F-B.2b: seleção de avatar (Ícaro/Hozana) nas preferências + player Unity.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const store: Record<string, unknown> = {}
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: <T>(key: string, fallback: T) => (key in store ? (store[key] as T) : fallback),
  setUserPreference: (key: string, value: unknown) => { store[key] = value },
}))

import { LIBRAS_PREFERENCE_KEYS, getLibrasAvatar, setLibrasAvatar } from '../services/libras-preferences'
import VLibrasUnityPlayer from '../components/VLibrasUnityPlayer.vue'

function mountPlayer(avatar?: 'icaro' | 'hozana') {
  const w = mount(VLibrasUnityPlayer, { props: avatar ? { avatar } : {} })
  const iframeEl = w.find('iframe').element as HTMLIFrameElement
  const postMessage = vi.fn()
  Object.defineProperty(iframeEl, 'contentWindow', { value: { postMessage }, configurable: true })
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'unity_event', event: 'on_load_player' }, source: iframeEl.contentWindow }))
  return { w, postMessage }
}

beforeEach(() => {
  delete store[LIBRAS_PREFERENCE_KEYS.avatar]
})

describe('F-B.2b — avatar preference', () => {
  it('default = icaro', () => {
    expect(getLibrasAvatar()).toBe('icaro')
  })
  it('set/get hozana persiste', () => {
    setLibrasAvatar('hozana')
    expect(getLibrasAvatar()).toBe('hozana')
  })
  it('valor inválido cai no default', () => {
    store[LIBRAS_PREFERENCE_KEYS.avatar] = 'etal'
    expect(getLibrasAvatar()).toBe('icaro')
  })
})

describe('F-B.2b — VLibrasUnityPlayer avatar', () => {
  it('on_load_player manda Change com avatar da pref (default icaro)', () => {
    const { postMessage } = mountPlayer()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ object: 'PlayerManager', method: 'Change', params: 'icaro' }), '*')
  })
  it('prop avatar=hozana vence pref', () => {
    setLibrasAvatar('icaro')
    const { postMessage } = mountPlayer('hozana')
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'Change', params: 'hozana' }), '*')
  })
  it('mudança de prop após ready: reenvia Change', async () => {
    const { w, postMessage } = mountPlayer('icaro')
    postMessage.mockClear()
    await w.setProps({ avatar: 'hozana' })
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'Change', params: 'hozana' }), '*')
  })
})
