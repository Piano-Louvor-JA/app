import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPlaylist, addPlaylistItem } from '../../../albums/services/playlist-storage'
import { createPlaylistHandlers } from '../playlist-handlers'

beforeEach(() => localStorage.clear())
function setup() {
  const list = createPlaylist('Culto')
  addPlaylistItem(list.id, { musicId: 1, albumId: 3, title: 'Primeiro' })
  addPlaylistItem(list.id, { musicId: 2, albumId: 3, title: 'Segundo' })
  const player = { queue: ref([{ musicId: 1, albumId: 3, title: 'Primeiro' }]), queueIndex: ref(0), queueLabel: ref('Culto'), queueShuffled: ref(false), playQueue: vi.fn(async () => {}), openTrack: vi.fn(async () => ({ ok: true as const })), nextTrack: vi.fn(), previousTrack: vi.fn(), jumpToQueue: vi.fn(), clearQueue: vi.fn(), playQueueInOrder: vi.fn() }
  return { list, player, handler: createPlaylistHandlers(player, () => 2) }
}
describe('playlists do desktop controladas remotamente', () => {
  it('espelha listas salvas e a fila atual', () => {
    const { handler, list } = setup()
    expect(handler.snapshot().lists[0]).toMatchObject({ id: list.id, name: 'Culto', items: [{ musicId: 1, title: 'Primeiro' }, { musicId: 2, title: 'Segundo' }] })
    expect(handler.snapshot()).toMatchObject({ queueIndex: 0, queueLabel: 'Culto', currentMusicId: 2 })
  })
  it('toca lista inteira e faixa avulsa pelo fluxo real de fila', async () => {
    const { handler, list, player } = setup()
    expect(await handler.execute('playlist.play', { targetId: list.id, mode: 'instrumental' })).toBe(true)
    expect(player.playQueue).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ musicId: 1 }), expect.objectContaining({ musicId: 2 })]), 0, 'instrumental', 'Culto', { minimized: true })
    expect(await handler.execute('playlist.track', { targetId: list.id, value: 1 })).toBe(true)
    expect(player.playQueue).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ musicId: 1 }), expect.objectContaining({ musicId: 2 })]), 1, 'audio', 'Culto', { minimized: true, project: false })
    expect(await handler.execute('playlist.track', { targetId: list.id, value: 99 })).toBe(false)
    expect(await handler.execute('playlist.play', { targetId: 'missing' })).toBe(false)
    expect(await handler.execute('playlist.play', { targetId: list.id, mode: 'invalid' })).toBe(false)
  })
  it('embaralha sem alterar dados salvos e navega na fila', async () => {
    const { handler, list, player } = setup()
    expect(await handler.execute('playlist.shuffle', { targetId: list.id })).toBe(true)
    expect(player.playQueue).toHaveBeenCalledWith(expect.any(Array), 0, 'audio', 'Culto', expect.objectContaining({ shuffled: true, originalOrder: expect.any(Array) }))
    expect(await handler.execute('playlist.next', {})).toBe(false)
    player.queue.value.push({ musicId: 2, albumId: 3, title: 'Segundo' })
    expect(await handler.execute('playlist.next', {})).toBe(true)
    player.queueIndex.value = 1
    expect(await handler.execute('playlist.previous', {})).toBe(true)
    expect(await handler.execute('playlist.jump', { value: 0 })).toBe(true)
    expect(player.jumpToQueue).toHaveBeenCalledWith(0)
    expect(await handler.execute('playlist.jump', { value: -1 })).toBe(false)
    expect(await handler.execute('playlist.unknown', {})).toBe(false)
  })
})
