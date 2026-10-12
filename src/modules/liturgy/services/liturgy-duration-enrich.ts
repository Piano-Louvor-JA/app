import type { LiturgyItem, LiturgyMusicOption } from "../types/liturgy";

/**
 * Enriquecimento de duração (t_14d066ea): música com `musicId` do catálogo
 * ganha `durationMs` da API quando o item está zerado. Vídeo/other_files
 * com `filePath` local podem ser enriquecidos via probe (desktop).
 *
 * Extraído do fluxo `.ja` (enrichJaDurations) para reuso no import
 * `.louvorja` — mesmo contrato, sem mudar o schema do pacote.
 */
export async function enrichItemsDurations(
  items: LiturgyItem[],
  musicList: LiturgyMusicOption[],
  probeMediaDurationMs?: (path: string) => Promise<number>,
): Promise<LiturgyItem[]> {
  if (items.length === 0) return items;
  const byId = new Map(musicList.map((m) => [m.id, m]));
  const probeCache = new Map<string, number>();
  return Promise.all(
    items.map(async (item) => {
      if (item.type === "music" && item.musicId != null) {
        if (item.durationMs && item.durationMs > 0) return item;
        const opt = byId.get(item.musicId);
        if (opt?.durationMs) return { ...item, durationMs: opt.durationMs };
        return item;
      }
      if (
        probeMediaDurationMs &&
        item.durationMs === 0 &&
        item.filePath &&
        (item.type === "video" || item.type === "other_files")
      ) {
        let probed = probeCache.get(item.filePath);
        if (probed === undefined) {
          probed = await probeMediaDurationMs(item.filePath);
          probeCache.set(item.filePath, probed);
        }
        if (probed > 0) return { ...item, durationMs: probed };
      }
      return item;
    }),
  );
}

/**
 * Pré-preenchimento do Resumo do Evento (t_b1a9deae): dia importado com
 * categorias horadas e sessão vazia → 1ª categoria.startTime / última
 * categoria.endTime. Nunca sobrescreve sessão já definida.
 */
export function deriveSessionTimesFromCategories(
  items: LiturgyItem[],
  current: { startTime: string | null; endTime: string | null },
): { startTime: string | null; endTime: string | null } {
  if (current.startTime && current.endTime) return current;
  const categories = items.filter(
    (item) => item.type === "category" && (item.startTime || item.endTime),
  );
  if (categories.length === 0) return current;
  const first = categories[0];
  const last = categories[categories.length - 1];
  return {
    startTime: current.startTime ?? first.startTime ?? null,
    endTime: current.endTime ?? last.endTime ?? null,
  };
}
