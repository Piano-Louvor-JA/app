import type { LiturgyItem, LiturgyMusicOption } from "../types/liturgy";
import { normalizeLiturgyTimeHHmm } from "./liturgy-format";
import {
  resolveCategoryEndTime,
  categoryEndSortKey,
} from "./liturgy-item-helpers";

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
  const next = await Promise.all(
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
  return next.every((item, index) => item === items[index]) ? items : next;
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

/* ---------- Sessão com categorias sem end (SPEC t_50c9ac95 B4) ---------- */

/**
 * Fim da sessão do dia (resumo do evento) considerando categorias sem endTime:
 * usa o MAIOR entre (última categoria com end real) e (categoria com start +
 * duração estimada dos filhos). Sem nenhum end nem duração → null.
 * Regra B5: end real sempre vence a estimativa.
 */
export function computeSessionTimes(
  items: LiturgyItem[],
  opts: { esChildren?: Record<string, LiturgyItem[]> } = {},
): { startTime: string | null; endTime: string | null } {
  const categories = items.filter((i) => i.type === 'category' && i.startTime);
  if (categories.length === 0) return { startTime: null, endTime: null };
  const first = categories[0];
  const cats = items.filter((i) => i.type === 'category' && i.startTime);
  let latest = '';
  let latestKey = -1;
  for (const cat of cats) {
    const children = opts.esChildren?.[cat.id] ?? [];
    const key = categoryEndSortKey(cat, children);
    const end = key != null ? resolveCategoryEndTime(cat, children) : null;
    if (key != null && key > latestKey) {
      latestKey = key;
      latest = end ?? '';
    }
  }
  return {
    startTime: normalizeLiturgyTimeHHmm(first.startTime ?? null),
    endTime: latest || null,
  };
}
