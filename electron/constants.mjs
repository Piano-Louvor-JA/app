import { loadProjectEnv, resolveApiBaseUrl } from './api-base.mjs'

loadProjectEnv()

/** Nome do produto no SO (janela, atalhos, productName do build). */
export const APP_PRODUCT_NAME = 'LouvorJA - PIANO'

/**
 * Nome da pasta de dados.
 * Windows empacotado: %ProgramData%\\LouvorJA-PIANO (compartilhado entre perfis).
 *   Mídia pode ficar em outra pasta (HKLM Software\\LouvorJA\\PIANO MediaRoot).
 * Linux empacotado: /var/lib/LouvorJA-PIANO (compartilhado entre perfis).
 * macOS empacotado: /Users/Shared/LouvorJA-PIANO (compartilhado entre perfis).
 * Dev: pasta per-user padrão do Electron.
 */
export const APP_USER_DATA_DIR = 'LouvorJA-PIANO'

export const WORKSPACE_DIRS = {
  sysdata: '.sysdata',
  media: 'Media',
  covers: 'covers',
  music: 'music',
  images: 'images',
  /** Mídias de módulos utilitários (ex.: áudio do sorteio). */
  modulos: 'modulos',
  sorteios: 'sorteios',
}

/** Arquivo SQLite temporário (legado FTP — não usado no first-boot HTTP). */
export const TEMP_DATABASE_FILE = 'database.db'

/** Flag legado do download FTP do catálogo (não usada no sync HTTP). */
export const DB_DOWNLOAD_COMPLETE_FLAG = 'db_download_complete.flag'

export const MEDIA_FOLDER_BY_TYPE = {
  covers: 'covers',
  music: 'music',
  slides: 'images',
}

/** Base da API usada pelo main-process (download de mídia + fallback local://).
 * Mesmo host do catálogo: PIANO_API_BASE_URL, senão a origem de VITE_URL_FILES.
 * Sem .env (app empacotado) permanece a API de produção. */
export const API_BASE_URL = resolveApiBaseUrl()
