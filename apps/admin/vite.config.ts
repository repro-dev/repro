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
    'process.env.AUTH_STORAGE': JSON.stringify(
      process.env.AUTH_STORAGE ?? 'local-storage'
    ),
    'process.env.BUILD_ENV': JSON.stringify(
      process.env.BUILD_ENV ?? 'production'
    ),
    'process.env.REPRO_WORKSPACE_URL': JSON.stringify(
      process.env.REPRO_WORKSPACE_URL ?? 'http://localhost:8080'
    ),
    'process.env.REPRO_ADMIN_URL': JSON.stringify(
      process.env.REPRO_ADMIN_URL ?? 'http://localhost:8081'
    ),
    'process.env.REPRO_API_URL': JSON.stringify(
      process.env.REPRO_API_URL ?? 'http://localhost:8182'
    ),
  },

  server: {
    port: Number(process.env.PORT) || 8081,
    allowedHosts: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    target: 'esnext',
  },
}))
