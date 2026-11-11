/**
 * RF-03 — publish: envia edit à fila da API; sem sessão mantém draft.
 * RF-04 — re-publish substitui (idempotência por clientUuid no servidor).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocalEdit, saveLocalEdit } from '../services/local-edits-store';
import { publishEdit } from '../services/publish-edit';

// custom-catalog transitivamente importa auth-client → firebase (pesado, sem stub ESM).
// O publish usa apenas customApiUrl/customHeaders — mockados aqui.
vi.mock('../../media/services/custom-catalog', () => ({
  customApiUrl: (path: string) => `https://api.test/v1/custom${path}`,
  customHeaders: () => ({ 'x-client-platform': 'test' }),
}));

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

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
});

describe('publish-edit (RF-03, RF-04)', () => {
  it('sem sessão → não envia, permanece draft', async () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'x' }]) });
    const result = await publishEdit(42, { getToken: () => null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.published).toBe(false);
    expect(getLocalEdit(42)?.status).toBe('draft');
  });

  it('com sessão → POST /v1/custom/edits com clientUuid estável; status→published', async () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'corrigida' }]) });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, status: 'published' }), { status: 201 }));
    const result = await publishEdit(42, { getToken: () => 'tok-123' });
    expect(result.published).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/edits');
    const body = JSON.parse(String(init.body) ?? '{}') as { clientUuid: string; musicId: number; lyrics: string };
    expect(body.musicId).toBe(42);
    expect(body.clientUuid).toHaveLength(64); // sha256 hex
    expect(getLocalEdit(42)?.status).toBe('published');
  });

  it('re-publicar conteúdo idêntico → mesmo clientUuid (idempotente)', async () => {
    saveLocalEdit(42, { lyrics: JSON.stringify([{ lyric: 'corrigida' }]) });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1, status: 'published' }), { status: 201 }));
    await publishEdit(42, { getToken: () => 'tok' });
    saveLocalEdit(42, { status: 'draft' }); // autor re-edita status local sem mudar conteúdo
    await publishEdit(42, { getToken: () => 'tok' });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body) ?? '{}') as { clientUuid: string });
    expect(bodies[0].clientUuid).toBe(bodies[1].clientUuid);
  });

  it('API 5xx → mantém draft, erro propagado sem quebrar', async () => {
    saveLocalEdit(9, { timing: '[0,100]' });
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const result = await publishEdit(9, { getToken: () => 'tok' });
    expect(result.published).toBe(false);
    expect(result.error).toBeTruthy();
    expect(getLocalEdit(9)?.status).toBe('draft');
  });
});
