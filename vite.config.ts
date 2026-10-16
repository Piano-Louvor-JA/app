import path from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { BAKED_PROFILE_FILE, rendererApiEnvFor } from './electron/profile.mjs'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// Contrato de perfil (SPEC piano-api-env-guard): o perfil efetivo é definido
// AQUI, uma única vez, a partir de PIANO_BUILD_PROFILE — nunca de .env local.
// O renderer recebe o perfil e os hosts derivados via import.meta.env.
// Caso real (v1.31.0): este define sumiu num merge e a release saiu em STG —
// `electron/guard/verify-bundle.mjs` confere o bundle depois do build.
const rendererEnv = rendererApiEnvFor(process.env)
const rendererDefine = Object.fromEntries(
  Object.entries(rendererEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
)

/** Grava o perfil em dist/ para o main empacotado (o PC do usuário não tem env). */
function bakeBuildProfile(): Plugin {
  return {
    name: 'piano-bake-build-profile',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BAKED_PROFILE_FILE,
        source: `${JSON.stringify({ profile: rendererEnv.VITE_PIANO_PROFILE })}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DIAGNOSTICS_DSN__: JSON.stringify(process.env.DIAGNOSTICS_GLITCHTIP_DSN ?? ''),
    // Só no build: o dev server segue lendo .env/.env.local (E2E e API local).
    ...(command === 'build' ? rendererDefine : {}),
  },
  server: {
    // node_modules é symlink p/ outro worktree (api-env-wt) — fora do root,
    // o Vite nega /@fs/ dele (403 em fontes tabler/fontsource). Autorizar o
    // caminho real resolvido mantém o bloqueio para todo o resto.
    fs: {
      // Root do projeto + realpath do node_modules (symlink p/ outro worktree).
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        path.dirname(realpathSync('node_modules')),
      ],
    },
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
    strictPort: true,
    port: 5173,
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    bakeBuildProfile(),
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
}))
