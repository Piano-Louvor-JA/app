/**
 * RF-03 — Publicar correção pra comunidade.
 * clientUuid = sha256(musicId + conteúdo) → re-publicar conteúdo idêntico
 * não duplica no servidor (idempotência, padrão custom do repo).
 * Sem sessão: não envia, permanece draft (RF-03).
 * Erro de rede/API: permanece draft, { published:false, error }.
 */
import { customApiUrl, customHeaders } from '../../media/services/custom-catalog';

import { getLocalEdit, markLocalEditPublished } from './local-edits-store';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PublishResult =
  | { published: true; clientUuid: string }
  | { published: false; error: string };

export async function publishEdit(
  musicId: number,
  opts: { getToken: () => string | null },
): Promise<PublishResult> {
  const edit = getLocalEdit(musicId);
  if (!edit) return { published: false, error: 'no local edit for this music' };
  const token = opts.getToken();
  if (!token) return { published: false, error: 'not signed in — edit kept as draft' };

  const clientUuid = await sha256Hex(`${musicId}:${edit.lyrics ?? ''}:${edit.timing ?? ''}`);
  try {
    const res = await fetch(customApiUrl('/edits'), {
      method: 'POST',
      headers: { ...customHeaders(), authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        clientUuid,
        musicId,
        ...(edit.lyrics ? { lyrics: edit.lyrics } : {}),
        ...(edit.timing ? { timing: edit.timing } : {}),
      }),
    });
    if (!res.ok) {
      return { published: false, error: `api error ${res.status}` };
    }
    markLocalEditPublished(musicId);
    return { published: true, clientUuid };
  } catch (e) {
    return { published: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
