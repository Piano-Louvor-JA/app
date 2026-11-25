import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getTranslation, saveTranslation } from '../services/libras-cache'
import { normalizeLyrics } from '../types'

// B6: normalização NFC/CRLF→LF/trim/whitespace colapsado
describe('libras/types normalizeLyrics (RF/B6)', () => {
  it('normaliza CRLF→LF, trim e colapsa whitespace interno', () => {
    expect(normalizeLyrics('  João\r\n   amarrou\r\n o\r\n\r\nhino  ')).toBe(
      'João amarrou o hino'
    );
  });

  it('normaliza Unicode NFC (decomposed → composed)', () => {
    const decomposed = 'e\u0301'; // é decomposto
    expect(normalizeLyrics(decomposed)).toBe('é');
  });

  it('string vazia/vazia-após-trim → string vazia (não lança)', () => {
    expect(normalizeLyrics('   ')).toBe('');
    expect(normalizeLyrics('')).toBe('');
  });
});

// B4/B5: cache IndexedDB nativo, falha silenciosa
describe('libras/services libras-cache (RF/B4)', () => {
  const KEY = 'abc123';
  const entry = {
    cacheKey: KEY,
    gloss: 'HINO AMARRO DEUS PALAVRA',
    source: 'João amarrou o hino',
    createdAt: 1700000000000,
  };

  beforeEach(() => {
    // fake-indexeddb é fresh por arquivo; garante estado limpo entre testes do mesmo arquivo
  });

  it('save → get roundtrip com mesma chave', async () => {
    await saveTranslation(entry);
    const got = await getTranslation(KEY);
    expect(got).toEqual(entry);
  });

  it('get em cache vazio → undefined (cache miss silencioso, não lança)', async () => {
    const got = await getTranslation('inexistente');
    expect(got).toBeUndefined();
  });
});
