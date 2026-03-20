import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

const mode = process.env.MODE || 'extension'

const extensionEntries: Record<string, string> = {
  background: path.resolve(__dirname, 'src/extension/background.ts'),
  content: path.resolve(__dirname, 'src/extension/content.ts'),
  page: path.resolve(__dirname, 'src/index.tsx'),
}

const standaloneEntries: Record<string, string> = {
  'toolbar-standalone': path.resolve(__dirname, 'src/index.tsx'),
}

const entries = mode === 'standalone' ? standaloneEntries : extensionEntries

const entry = process.env.VITE_ENTRY
if (!entry || !entries[entry]) {
  throw new Error(
    `VITE_ENTRY must be one of: ${Object.keys(entries).join(', ')}`
  )
}

const needsReact = entry === 'page' || entry === 'toolbar-standalone'

export default defineConfig(({ mode: viteMode }) => ({
  plugins: needsReact ? [react()] : [],

  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.BUILD_VERSION ?? 'unknown'),
    'process.env.AUTH_STORAGE': JSON.stringify(
      process.env.AUTH_STORAGE ?? 'local-storage'
    ),
    'process.env.BUILD_ENV': JSON.stringify(
      process.env.BUILD_ENV ?? 'production'
    ),
    'process.env.MODE': JSON.stringify(process.env.MODE ?? 'extension'),
    'process.env.REPRO_API_URL': JSON.stringify(
      process.env.REPRO_API_URL ?? ''
    ),
    'process.env.STATS_LEVEL': JSON.stringify(
      process.env.STATS_LEVEL ?? 'debug'
    ),
  },

  build: {
    outDir: 'dist',
    sourcemap: viteMode !== 'production',
    target: 'esnext',
    lib: {
      entry: entries[entry]!,
      name: entry,
      formats: ['iife'],
      fileName: () => `${entry}.js`,
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
    emptyOutDir: false,
  },
}))
