import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  define: {
    'process.env.BUILD_ENV': JSON.stringify(
      process.env.BUILD_ENV ?? 'production'
    ),
    'process.env.STATS_LEVEL': JSON.stringify(
      process.env.STATS_LEVEL ?? 'debug'
    ),
  },

  server: {
    port: Number(process.env.PORT) || 8080,
    allowedHosts: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    target: 'esnext',
  },
}))
