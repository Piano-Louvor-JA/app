import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { profileApiConfig, resolveBuildProfile } from './electron/profile.mjs'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// Contrato de perfil (SPEC piano-api-env-guard): o perfil efetivo é definido
// AQUI, uma única vez, a partir de PIANO_BUILD_PROFILE — nunca de .env local.
// O renderer recebe o perfil e os hosts derivados via import.meta.env.
const buildProfile = resolveBuildProfile(process.env)
const profileConfig = profileApiConfig(buildProfile)
const rendererEnv = {
  VITE_PIANO_PROFILE: buildProfile,
  VITE_URL_DATABASE: process.env.VITE_URL_DATABASE ?? `${profileConfig.primary}/json_db`,
  VITE_URL_FILES: process.env.VITE_URL_FILES ?? `${profileConfig.primary}/file`,
  VITE_PALCO_API_URL: process.env.VITE_PALCO_API_URL ?? profileConfig.primary,
  ...(process.env.VITE_API_FALLBACK_URLS || profileConfig.fallbackHosts.length
    ? {
        VITE_API_FALLBACK_URLS:
          process.env.VITE_API_FALLBACK_URLS ?? profileConfig.fallbackHosts.join(','),
      }
    : {}),
}

// https://vite.dev/config/
export default defineConfig({
  // LOCAL do worktree de teste: node_modules é symlink pra
  // /media/.../Dados/repos/piano-app/node_modules — sem allow o /@fs/ dá 403 nas fontes.
  server: {
    fs: {
      allow: ['.', '/media/rafaelejosi/Dados/repos/piano-app/node_modules'],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Injeta o contrato efetivo (auditoria RF-01 + paridade renderer/main).
    'import.meta.env.VITE_PIANO_PROFILE': JSON.stringify(rendererEnv.VITE_PIANO_PROFILE),
    'import.meta.env.VITE_URL_DATABASE': JSON.stringify(rendererEnv.VITE_URL_DATABASE),
    'import.meta.env.VITE_URL_FILES': JSON.stringify(rendererEnv.VITE_URL_FILES),
    'import.meta.env.VITE_PALCO_API_URL': JSON.stringify(rendererEnv.VITE_PALCO_API_URL),
    ...(rendererEnv.VITE_API_FALLBACK_URLS !== undefined
      ? {
          'import.meta.env.VITE_API_FALLBACK_URLS': JSON.stringify(
            rendererEnv.VITE_API_FALLBACK_URLS,
          ),
        }
      : {}),
  },
  server: {
    watch: {
      // Worktrees de kanban geram milhares de arquivos — watcher satura e o
      // dev server para de responder (ENOSPC inotify / startup travado).
      // Worktrees de kanban vivem em symlink p/ volume NTFS
      // (/media/.../gauntlet-worktrees) — o glob '**/.worktrees/**' NÃO pega o
      // caminho real resolvido, e o watcher lê ~1.4GB até travar o server.
      ignored: [
        '**/.worktrees/**',
        '/media/rafaelejosi/NovoVolume/gauntlet-worktrees/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/test-results/**',
        '**/coverage/**',
      ],
    },
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': path.resolve(__dirname, './src/app'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@design-system': path.resolve(__dirname, './src/design-system'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@themes': path.resolve(__dirname, './src/design-system/themes'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@locales': path.resolve(__dirname, './src/locales'),
    },
  },
})
