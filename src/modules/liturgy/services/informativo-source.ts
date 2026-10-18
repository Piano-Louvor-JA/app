/** Fonte pontual do Informativo Mundial das Missões: embed YouTube no post semanal. */
export interface InformativoEpisode {
  dateISO: string
  title: string
  url: string
}

/** Extrai o primeiro vídeo YouTube do post; links de página nunca entram na liturgia. */
export function extractInformativoEpisode(html: string, dateISO: string): InformativoEpisode | null {
  const match = /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i.exec(html)
  if (!match) return null
  return {
    dateISO,
    title: 'Informativo Mundial das Missões',
    url: `https://www.youtube.com/watch?v=${match[1]}`,
  }
}
