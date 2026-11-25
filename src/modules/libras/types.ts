// File: /home/rafaelejosi/pianolouvorja/app/src/modules/libras/types.ts
// SPDX-License-Identifier: MIT
// Contrato de tipos para Libras, sem dependência de bibliotecas externas além de tipos nativos JS/TS.

export type LibrasTranslation = {
    cacheKey: string; // sha-256(normalizedLyrics)
    gloss: string;    // Gloss em PT-BR (texto puro, sem tags HTML)
    source: string;  // Fonte original (letra completa)
    createdAt: number; // Timestamp Unix do cache
};

export type LibrasState = 'disabled' | 'loading' | 'ready' | 'unavailable';

// Chave de cache: NFC, CRLF->LF, trim, colapsar whitespace interno.
export function normalizeLyrics(lyrics: string): string {
    return lyrics.normalize('NFC').replace(/\r\n/g, '\n').trim().replace(/\s+/g, ' ');
}
