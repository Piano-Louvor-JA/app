/** Fonte pontual do Informativo Mundial das Missões: embed YouTube no post semanal. */
export interface InformativoEpisode {
  dateISO: string
  title: string
  url: string
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const POST_URL_TEMPLATE =
  'https://www.daniellocutor.com.br/{year}/{month}/informativo-mundial-das-missoes-{day}-{monthName}-{year}/'

/**
 * yyyy-mm-dd pelos componentes LOCAIS. `toISOString()` serializa UTC e,
 * em timezones positivas (ex. UTC+14), joga o sábado local para sexta.
 */
export function toISODateLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** URL determinística do post do Daniel Locutor para o sábado da data. */
export function informativoPostUrl(dateISO: string): string {
  const [year, month, day] = dateISO.split('-')
  const index = Number(month) - 1
  return POST_URL_TEMPLATE.replaceAll('{year}', year ?? '')
    .replaceAll('{month}', month ?? '')
    .replaceAll('{day}', day ?? '')
    .replace('{monthName}', MONTH_NAMES[index] ?? '')
}

/** Próximos `count` sábados a partir de `from` (inclusive se `from` for sábado). */
export function informativoUpcomingSaturdays(from: Date, count: number): string[] {
  const saturday = new Date(from)
  saturday.setDate(from.getDate() + ((6 - from.getDay() + 7) % 7))
  const dates: string[] = []
  for (let week = 0; week < count; week++) {
    const date = new Date(saturday)
    date.setDate(saturday.getDate() + week * 7)
    dates.push(toISODateLocal(date))
  }
  return dates
}

/** Extrai o primeiro vídeo YouTube do post (embed HTML ou link watch no markdown); página nunca entra. */
export function extractInformativoEpisode(html: string, dateISO: string): InformativoEpisode | null {
  const match =
    /(?:youtube(?:-nocookie)?\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/i.exec(html)
  if (!match || !match[1]) return null
  return {
    dateISO,
    title: 'Informativo Mundial das Missões',
    url: `https://www.youtube.com/watch?v=${match[1]}`,
  }
}
