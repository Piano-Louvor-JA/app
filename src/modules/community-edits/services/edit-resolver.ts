/**
 * EditResolver — camada de override na resolução de faixa oficial (RF-02, RF-08).
 * Ordem: edit LOCAL do autor (draft ou published) vence; senão edit `applied`
 * remoto (aprovado pelo concilio); senão o registro oficial intacto.
 *
 * Risco da PLAN §4 tratado: lookup é O(1) em memória (localStorage parse
 * único), sem await na projeção — o fetcher remoto só roda quando não há
 * edit local e é injetado pelo caller (componente/boot), nunca no hot path.
 */
import type { MediaTrackRecord, MediaLyricSlide } from '../../media/types/media';

import { getLocalEdit } from './local-edits-store';

export type AppliedEdit = { lyrics: string | null; timing: string | null };
export type AppliedFetcher = (musicId: number) => Promise<AppliedEdit | null>;

function parseSlides(json: string | null): MediaLyricSlide[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as MediaLyricSlide[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Aplica override de letra/timing por cima do registro oficial, PRESERVANDO
 * metadados (RF-01): nome, áudio, capa, álbuns, categorias permanecem oficiais.
 * Campos null no edit não apagam o conteúdo oficial (edit parcial).
 */
export function applyEditToTrack(
  official: MediaTrackRecord,
  edit: AppliedEdit,
): MediaTrackRecord {
  const lyrics = parseSlides(edit.lyrics);
  return {
    ...official,
    ...(lyrics ? { lyrics } : {}),
  };
}

export async function resolveEditOverride(
  musicId: number,
  official: MediaTrackRecord,
  fetchApplied: AppliedFetcher,
): Promise<MediaTrackRecord | null> {
  // 1) edit local do autor (RF-02) — offline, sem rede
  const local = getLocalEdit(musicId);
  if (local && (local.lyrics || local.timing)) {
    return applyEditToTrack(official, { lyrics: local.lyrics, timing: local.timing });
  }
  // 2) edit applied remoto (RF-08, promovido pelo concilio)
  const applied = await fetchApplied(musicId);
  if (applied && (applied.lyrics || applied.timing)) {
    return applyEditToTrack(official, applied);
  }
  // 3) oficial intacta
  return official;
}
