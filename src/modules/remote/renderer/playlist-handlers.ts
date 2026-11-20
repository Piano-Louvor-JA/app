import { listPlaylists } from '../../albums/services/playlist-storage'
import type { useMediaPlayer } from '../../media/composables/useMediaPlayer'
import type { MediaPlaybackMode } from '../../media/types/media'

type Player = Pick<ReturnType<typeof useMediaPlayer>, 'queue' | 'queueIndex' | 'queueLabel' | 'queueShuffled' | 'playQueue' | 'nextTrack' | 'previousTrack' | 'jumpToQueue' | 'clearQueue' | 'playQueueInOrder'>

export function createPlaylistHandlers(player: Player, currentMusicId: () => number | null = () => null) {
  function snapshot() {
    return {
      currentMusicId: currentMusicId(),
      lists: listPlaylists().map(list => ({ id: list.id, name: list.name, items: list.items.map(item => ({ musicId: item.musicId, albumId: item.albumId, title: item.title })) })),
      queue: (player.queue?.value ?? []).map(item => ({ musicId: item.musicId, albumId: item.albumId, title: item.title })),
      queueIndex: player.queueIndex?.value ?? -1,
      queueLabel: player.queueLabel?.value ?? null,
      shuffled: player.queueShuffled?.value ?? false,
    }
  }
  async function execute(action: string, msg: Record<string, unknown>): Promise<boolean> {
    if (['playlist.play', 'playlist.track', 'playlist.shuffle'].includes(action)) {
      const mode = msg.mode ?? 'audio'
      if (mode !== 'audio' && mode !== 'instrumental' && mode !== 'no_audio') return false
      const list = listPlaylists().find(list => list.id === msg.targetId)
      if (!list?.items.length) return false
      let items = [...list.items]
      if (action === 'playlist.track') {
        if (!Number.isInteger(msg.value) || Number(msg.value) < 0 || Number(msg.value) >= items.length) return false
        // Mantém a lista completa para anterior/próxima, começando na seleção.
        await player.playQueue(items, Number(msg.value), mode as MediaPlaybackMode, list.name, { minimized: true, project: false })
        return true
      }
      const shuffled = action === 'playlist.shuffle'
      if (shuffled) {
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[items[i], items[j]] = [items[j]!, items[i]!]
        }
      }
      await player.playQueue(items, 0, mode as MediaPlaybackMode, list.name,
        shuffled ? { minimized: true, originalOrder: list.items, shuffled: true } : { minimized: true })
      return true
    }
    const queue = player.queue?.value ?? []
    const index = player.queueIndex?.value ?? -1
    switch (action) {
      case 'playlist.next':
        if (index < 0 || index + 1 >= queue.length) return false
        player.nextTrack(); return true
      case 'playlist.previous':
        if (index <= 0 || index >= queue.length) return false
        player.previousTrack(); return true
      case 'playlist.jump':
        if (!Number.isInteger(msg.value) || Number(msg.value) < 0 || Number(msg.value) >= queue.length) return false
        player.jumpToQueue(Number(msg.value)); return true
      case 'playlist.order':
        if (typeof msg.enabled !== 'boolean' || !queue.length) return false
        player.playQueueInOrder(msg.enabled); return true
      case 'playlist.clear': player.clearQueue(); return true
      default: return false
    }
  }
  return { execute, snapshot }
}
