/**
 * LocalEditsStore — edits da comunidade, lado local (RF-02 local-first, RF-01 escopo restrito).
 * Persistência: localStorage pelo padrão do local-custom-store (chave própria).
 * Escopo do edit (RF-01): SOMENTE letra (lyrics) e timing. Áudio, bg, capa e
 * metadados nunca entram no registro — o tipo não tem esses campos e o save
 * filtra antes de persistir.
 */

const STORAGE_KEY = 'louvorja.local-edits.v1';

export type LocalEditStatus = 'draft' | 'published';

export type LocalEdit = {
  musicId: number;
  /** JSON dos slides editados (mesmo formato de lyrics do catálogo) ou null. */
  lyrics: string | null;
  /** JSON das marcações de slide ou null. */
  timing: string | null;
  status: LocalEditStatus;
  updatedAtMs: number;
};

type EditMap = Record<string, LocalEdit>;

function readMap(): EditMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: EditMap): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function saveLocalEdit(
  musicId: number,
  data: { lyrics?: string | null; timing?: string | null; status?: LocalEditStatus },
): LocalEdit {
  const map = readMap();
  const key = String(musicId);
  const previous = map[key];
  // RF-01: só os dois campos do escopo persistem — o resto é descartado aqui.
  const edit: LocalEdit = {
    musicId,
    lyrics: data.lyrics ?? previous?.lyrics ?? null,
    timing: data.timing ?? previous?.timing ?? null,
    status: data.status ?? previous?.status ?? 'draft',
    updatedAtMs: Date.now(),
  };
  map[key] = edit;
  writeMap(map);
  return edit;
}

export function getLocalEdit(musicId: number): LocalEdit | null {
  return readMap()[String(musicId)] ?? null;
}

export function listLocalEdits(): LocalEdit[] {
  return Object.values(readMap()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function deleteLocalEdit(musicId: number): void {
  const map = readMap();
  delete map[String(musicId)];
  writeMap(map);
}

/** publicar localmente muda o status; o envio à API fica no publish service. */
export function markLocalEditPublished(musicId: number): void {
  const edit = getLocalEdit(musicId);
  if (edit) saveLocalEdit(musicId, { status: 'published' });
}
