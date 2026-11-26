// File: src/modules/libras/__tests__/libras-translate.test.ts
// SPDX-License-Identifier: MIT
// TDD P2: fluxo Cache > API > Fallback, timeout 15s, falha silenciosa.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cacheGet = vi.fn();
const cacheSave = vi.fn();
vi.mock('../services/libras-cache', () => ({
    getTranslation: (...a: unknown[]) => cacheGet(...a),
    saveTranslation: (...a: unknown[]) => cacheSave(...a),
}));

import { getLibrasGloss } from '../services/libras-translate';

describe('libras-translate (P2 — RF Gloss)', () => {
    const origFetch = globalThis.fetch;

    beforeEach(() => {
        cacheGet.mockReset().mockResolvedValue(undefined);
        cacheSave.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
        vi.restoreAllMocks();
    });

    it('cache HIT: devolve gloss do cache sem chamar API', async () => {
        cacheGet.mockResolvedValue({ cacheKey: 'a b c', gloss: 'GLOSS CACHE', source: 'a b c', createdAt: 1 });
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        const r = await getLibrasGloss('a\r\nb  c');

        expect(r).toEqual({ gloss: 'GLOSS CACHE', sourceUsed: 'cache' });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(cacheSave).not.toHaveBeenCalled();
    });

    it('cache MISS + API OK: salva no cache e devolve gloss (texto puro)', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('GLOSS API\n'),
        });
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        const r = await getLibrasGloss('Aleluia');

        expect(r).toEqual({ gloss: 'GLOSS API', sourceUsed: 'api' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://traducao2.vlibras.gov.br/translate');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ text: 'Aleluia' });
        expect(cacheSave).toHaveBeenCalledTimes(1);
        expect(cacheSave.mock.calls[0][0]).toMatchObject({ cacheKey: 'Aleluia', gloss: 'GLOSS API' });
    });

    it('API status não-OK: fallback datilologia, não lança, não salva cache', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

        const r = await getLibrasGloss('Aleluia');

        expect(r.sourceUsed).toBe('fallback');
        expect(r.gloss).not.toBeNull();
        expect(cacheSave).not.toHaveBeenCalled();
    });

    it('API offline (fetch reject): fallback datilologia, falha silenciosa (não lança)', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

        const r = await getLibrasGloss('Aleluia');

        expect(r.sourceUsed).toBe('fallback');
        expect(r.gloss).not.toBeNull();
    });

    it('fallback = datilologia letra a letra da letra normalizada', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;

        const r = await getLibrasGloss('a b');

        // datilologia: letras separadas por espaço, preservando espaços entre palavras
        expect(r.gloss).toBe('A _ B');
    });

    it('AbortSignal.timeout de 15s é usado na chamada', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('G'),
        });
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        await getLibrasGloss('x');

        const init = fetchSpy.mock.calls[0][1] as RequestInit;
        expect(init.signal).toBeInstanceOf(AbortSignal);
        // TimeoutError após 15s — validamos o tipo do sinal, não esperamos o tempo real
        expect(init.signal?.aborted).toBe(false);
    });
});
