import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
