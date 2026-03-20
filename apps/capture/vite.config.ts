import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const entries: Record<string, string> = {
  background: path.resolve(__dirname, 'src/extension/background.ts'),
  content: path.resolve(__dirname, 'src/extension/content.ts'),
  bridgeHost: path.resolve(__dirname, 'src/extension/bridgeHost.ts'),
  capture: path.resolve(__dirname, 'src/index.tsx'),
}

const entry = process.env.VITE_ENTRY
if (!entry || !entries[entry]) {
  throw new Error(
    `VITE_ENTRY must be one of: ${Object.keys(entries).join(', ')}`
  )
}

export default defineConfig(({ mode }) => ({
  plugins: entry === 'capture' ? [tailwindcss(), react()] : [],

  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.BUILD_ENV': JSON.stringify(
      process.env.BUILD_ENV ?? 'development'
    ),
    'process.env.MIXPANEL_API_URL': JSON.stringify(
      process.env.MIXPANEL_API_URL ?? ''
    ),
    'process.env.MIXPANEL_TOKEN': JSON.stringify(
      process.env.MIXPANEL_TOKEN ?? ''
    ),
    'process.env.REPRO_APP_URL': JSON.stringify(
      process.env.REPRO_APP_URL ?? 'http://app.repro.localhost'
    ),
    'process.env.REPRO_API_URL': JSON.stringify(
      process.env.REPRO_API_URL ?? 'http://api.repro.localhost'
    ),
    'process.env.AUTH_STORAGE': JSON.stringify(
      process.env.AUTH_STORAGE ?? 'memory'
    ),
    'process.env.STATS_LEVEL': JSON.stringify(
      process.env.STATS_LEVEL ?? 'debug'
    ),
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
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
      },
    },
    emptyOutDir: false,
  },
}))
