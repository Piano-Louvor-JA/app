import type { useAnnouncementsStore } from '../../announcements/stores/useAnnouncementsStore'
import type { useAnnouncementsCarousel } from '../../announcements/composables/useAnnouncementsCarousel'
import { isInCarousel, CAROUSEL_SLIDE_MS_MIN, CAROUSEL_SLIDE_MS_MAX, type Announcement } from '../../announcements/types/announcements'
import { notesHtmlToPlainText } from '../../liturgy/services/rich-notes'

type Carousel = Pick<ReturnType<typeof useAnnouncementsCarousel>, 'status' | 'index' | 'total' | 'currentSlide' | 'start' | 'pause' | 'resume' | 'next' | 'prev' | 'stop' | 'setSlideMs' | 'setLoop'>

/** O APK controla os serviços do desktop; nenhum arquivo é copiado para o celular. */
export function createAnnouncementsHandlers({ store, carousel, project }: {
  store: ReturnType<typeof useAnnouncementsStore>
  carousel: Carousel
  project: (item: Announcement) => Promise<{ ok: boolean }>
}) {
  function snapshot() {
    const slide = carousel.currentSlide.value
    return {
      activeListId: store.activeListId,
      lists: store.lists.map(list => ({ id: list.id, name: list.name, items: list.items.map(item => ({
        id: item.id, title: item.title, kind: item.kind,
        text: item.kind === 'text' ? item.plainText : item.kind === 'url' ? item.url : '',
        fileCount: item.kind === 'images' ? item.files.length : (item.kind === 'video' || item.kind === 'presentation') && item.file ? 1 : 0,
        fileName: (item.kind === 'video' || item.kind === 'presentation') ? item.file?.name ?? '' : '',
        inCarousel: isInCarousel(item),
      })) })),
      slideMs: store.carousel.slideMs,
      loop: store.carousel.loop,
      status: carousel.status.value,
      slideIndex: carousel.index.value,
      slideCount: carousel.total.value,
      previewTitle: slide?.kind === 'text' ? slide.title : slide?.kind === 'image' ? slide.name : '',
      previewText: slide?.kind === 'text' ? notesHtmlToPlainText(slide.html) : '',
    }
  }

  async function execute(action: string, msg: Record<string, unknown>): Promise<boolean> {
    switch (action) {
      case 'announcements.selectList':
        if (typeof msg.targetId !== 'string' || !store.lists.some(list => list.id === msg.targetId)) return false
        store.setActiveList(msg.targetId)
        return true
      case 'announcements.open': {
        if (typeof msg.targetId !== 'string') return false
        const item = store.activeList.items.find(item => item.id === msg.targetId)
        return item ? (await project(item)).ok : false
      }
      case 'announcements.include': {
        if (typeof msg.targetId !== 'string' || typeof msg.enabled !== 'boolean') return false
        const item = store.activeList.items.find(item => item.id === msg.targetId)
        if (!item || (item.kind !== 'text' && item.kind !== 'images')) return false
        store.updateAnnouncement({ ...item, inCarousel: msg.enabled })
        return true
      }
      case 'announcements.setCarousel': {
        const duration = msg.durationMs
        const loop = msg.enabled
        if (duration != null && (typeof duration !== 'number' || !Number.isInteger(duration) || duration < CAROUSEL_SLIDE_MS_MIN || duration > CAROUSEL_SLIDE_MS_MAX)) return false
        if (loop != null && typeof loop !== 'boolean') return false
        if (duration == null && loop == null) return false
        if (typeof duration === 'number') { store.setCarousel({ slideMs: duration }); carousel.setSlideMs(duration) }
        if (typeof loop === 'boolean') { store.setCarousel({ loop }); carousel.setLoop(loop) }
        return true
      }
      case 'announcements.start': return carousel.start(store.activeList.items, store.carousel)
      case 'announcements.pause': carousel.pause(); return true
      case 'announcements.resume': carousel.resume(); return true
      case 'announcements.next': carousel.next(); return true
      case 'announcements.previous': carousel.prev(); return true
      case 'announcements.stop': carousel.stop(); return true
      default: return false
    }
  }
  return { snapshot, execute }
}
