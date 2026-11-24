// File: /home/rafaelejosi/pianolouvorja/app/src/modules/libras/services/libras-cache.ts
// SPDX-License-Identifier: MIT
// Serviço de cache IndexedDB nativo para Libras.

import type { LibrasTranslation } from '../types';

// Define DB/Store names conforme SPEC
const DB_NAME = 'louvorja-libras';
const STORE_NAME = 'translations';
const DB_VERSION = 1; // schemaVersion v1.0.0

// Acesso a IndexedDB nativo (disponível no Electron renderer e browsers).
const idbFactory: IDBFactory | undefined =
    typeof indexedDB !== 'undefined' ? indexedDB : (globalThis as { indexedDB?: IDBFactory }).indexedDB;

/**
 * Inicializa e retorna uma conexão com o IndexedDB.
 * @returns Promise<IDBDatabase>
 */
function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!idbFactory) return reject(new Error('IndexedDB não suportado neste ambiente (Electron renderer).'));
        
        const request = idbFactory.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: Event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
            }
        };

        request.onsuccess = (event: Event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event: Event) => {
            reject(new Error(`Erro ao abrir DB: ${(event.target as IDBRequest).error?.name || 'Unknown Error'}`));
        };
    });
}

/**
 * Armazena uma tradução no cache.
 * @param translation Objeto LibrasTranslation.
 * @returns Promise<void>
 */
export async function saveTranslation(translation: LibrasTranslation): Promise<void> {
    try {
        const db = await openDb();
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const request = store.put(translation);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Erro ao salvar tradução no IndexedDB.'));
        });
    } catch (error) {
        // Log técnico local (sem throw para UI)
        console.error('LibrasCache: Falha ao salvar no DB.', error);
        throw new Error('Unavailable'); // Estado silencioso (SPEC 38)
    }
}

/**
 * Busca uma tradução pelo hash da letra.
 * @param cacheKey Hash da letra.
 * @returns Promise<LibrasTranslation | undefined>
 */
export async function getTranslation(cacheKey: string): Promise<LibrasTranslation | undefined> {
    try {
        const db = await openDb();
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        
        return new Promise((resolve, reject) => {
            const request = store.get(cacheKey);
            request.onsuccess = () => resolve(request.result as LibrasTranslation | undefined);
            request.onerror = () => reject(new Error('Erro ao buscar tradução no IndexedDB.'));
        });
    } catch (error) {
        console.error('LibrasCache: Falha ao buscar no DB.', error);
        return undefined; // Cache miss silencioso
    }
}
