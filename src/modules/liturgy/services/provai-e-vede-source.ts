/**
 * Fonte oficial do Provai e Vede: página de downloads do adventistas.org.
 * Os MP4 ficam num bucket público (Backblaze B2) com a data no nome do arquivo:
 *   {MM}-{DD}-{AA}_{slug}.mp4
 * Esta unidade é PURA: recebe o HTML e extrai {dateISO, title, url}.
 * O fetch (e o download) ficam por conta do chamador (bridge no desktop).
 */
export interface ProvaiEpisode {
  /** yyyy-mm-dd (do nome do arquivo) */
  dateISO: string
  /** slug → título legível */
  title: string
  /** URL já encodada, pronta pra fetch/download */
  url: string
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/** Extrai episódios de um HTML da página de downloads (href terminando em .mp4). */
export function extractProvaiEVedeEpisodes(html: string): ProvaiEpisode[] {
  const episodes: ProvaiEpisode[] = []
  const seen = new Set<string>()

  const re = /href="(https:[^"]*\/(\d{2})-(\d{2})-(\d{2})_[^"]*\.mp4)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const url = m[1]!
    if (seen.has(url)) continue
    seen.add(url)

    const mm = Number(m[2])
    const dd = Number(m[3])
    const yy = Number(m[4])
    const year = 2000 + yy
    const dateISO = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`

    // slug: depois do "_", antes de ".mp4", decodificado
    const fileName = decodeURIComponent(url.split('/').pop() ?? '')
    const slug = fileName.replace(/^\d{2}-\d{2}-\d{2}_/, '').replace(/\.mp4$/i, '')

    episodes.push({ dateISO, title: slugToTitle(slug), url })
  }

  episodes.sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  return episodes
}
