import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig } from 'vite'

function gitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
    }).trim()
    const slug = branch
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .toLowerCase()
    return { branch, slug }
  } catch {
    return { branch: 'unknown', slug: 'unknown' }
  }
}

const { branch: GIT_BRANCH, slug: GIT_SLUG } = gitInfo()

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
  plugins: entry === 'capture' ? [react()] : [],

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
      process.env.REPRO_APP_URL ?? 'https://app.repro.localhost'
    ),
    'process.env.REPRO_API_URL': JSON.stringify(
      process.env.REPRO_API_URL ?? 'https://api.repro.localhost'
    ),
    'process.env.AUTH_STORAGE': JSON.stringify(
      process.env.AUTH_STORAGE ?? 'memory'
    ),
    'process.env.STATS_LEVEL': JSON.stringify(
      process.env.STATS_LEVEL ?? 'debug'
    ),
    'process.env.GIT_BRANCH': JSON.stringify(GIT_BRANCH),
    'process.env.GIT_SLUG': JSON.stringify(GIT_SLUG),
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
