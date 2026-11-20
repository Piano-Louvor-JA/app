/**
 * RF-01..RF-08 (parte desktop) — store local de edits + override na resolução.
 * PLAN §1.2: local-first, editor restrito a letra/timing, override no resolveMediaTrack.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLocalEdit, listLocalEdits, saveLocalEdit,
} from '../services/local-edits-store';
import { resolveEditOverride } from '../services/edit-resolver';

const localStorage = (() => {
  let map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
})();
vi.stubGlobal('localStorage', localStorage);

beforeEach(() => localStorage.clear());

describe('local-edits-store (RF-02, RF-08)', () => {
  it('save → get: draft persiste letra/timing por musicId', () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'corrigida' }]) });
    const edit = getLocalEdit(42);
    expect(edit).not.toBeNull();
    expect(edit?.status).toBe('draft');
    expect(JSON.parse(edit?.lyrics ?? '[]')).toEqual([{ lyric: 'corrigida' }]);
  });

  it('RF-01: save ignora campos fora do escopo (audio/bg/metadados nunca persistem)', () => {
    saveLocalEdit(7, {
      lyrics: JSON.stringify([{ lyric: 'x' }]),
      audioUrl: 'https://evil/audio.mp3',
      name: 'Novo título',
      coverUrl: 'https://evil/bg.png',
    } as never);
    const edit = getLocalEdit(7) as Record<string, unknown>;
    expect(edit.audioUrl).toBeUndefined();
    expect(edit.name).toBeUndefined();
    expect(edit.coverUrl).toBeUndefined();
  });

  it('list + status transitions draft→published', () => {
    saveLocalEdit(1, { timing: JSON.stringify([0, 100]) });
    saveLocalEdit(2, { lyrics: '[]' });
    expect(listLocalEdits()).toHaveLength(2);
    saveLocalEdit(1, { timing: JSON.stringify([0, 100]), status: 'published' });
    expect(getLocalEdit(1)?.status).toBe('published');
  });
});

describe('edit-resolver — override na resolução (RF-02, RF-08)', () => {
  const official = { id: 42, name: 'Hino Oficial', lyrics: [{ lyric: 'original', order: 0 }] };

  it('edit local (draft ou published) do autor vence oficial', async () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'meu edit' }]) });
    const resolved = await resolveEditOverride(42, official, async () => null);
    expect(resolved?.lyrics).toEqual([{ lyric: 'meu edit' }]);
    expect(resolved?.name).toBe('Hino Oficial'); // metadados oficiais preservados (RF-01)
  });

  it('sem edit local → applied remoto; sem applied → oficial', async () => {
    const fromRemote = await resolveEditOverride(42, official, async () => ({
      lyrics: JSON.stringify([{ lyric: 'aprovado concilio' }]),
      timing: null,
    }));
    expect(fromRemote?.lyrics).toEqual([{ lyric: 'aprovado concilio' }]);

    const plain = await resolveEditOverride(42, official, async () => null);
    expect(plain).toBe(official); // sem edit: identidade oficial (mesmo objeto)
  });

  it('RF-02: funciona sem rede (fetcher nunca chamado quando existe edit local)', async () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'offline' }]) });
    const fetcher = vi.fn(async () => null);
    await resolveEditOverride(42, official, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lyrics/timing null no edit → oficial mantida (edit parcial não apaga conteúdo)', async () => {
    saveLocalEdit(42, { timing: JSON.stringify([0, 100]) }); // só timing
    const resolved = await resolveEditOverride(42, official, async () => null);
    expect(resolved?.lyrics).toEqual(official.lyrics); // letra oficial intacta
  });
});
