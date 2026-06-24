import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, Plugin } from 'vite'

function htmlEnvPlugin(envVars: Record<string, string>): Plugin {
  return {
    name: 'html-env',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/%(\w+)%/g, (_, key) => envVars[key] ?? '')
      },
    },
  }
}

function htmlTemplatePlugin(envVarNames: string[]): Plugin {
  return {
    name: 'html-template',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.html')) {
          let html = chunk.source as string

          for (const name of envVarNames) {
            html = html.replaceAll(`%${name}%`, `$${name}`)
          }

          this.emitFile({
            type: 'asset',
            fileName: fileName.replace('.html', '.template.html'),
            source: html,
          })
        }
      }
    },
  }
}

const envVarNames = [
  'BUILD_ENV',
  'REPRO_WORKSPACE_URL',
  'REPRO_ADMIN_URL',
  'REPRO_API_URL',
]

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    htmlEnvPlugin(
      Object.fromEntries(
        envVarNames.map(name => [name, process.env[name] ?? ''])
      )
    ),
    htmlTemplatePlugin(envVarNames),
  ],

  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  define: {
    'process.env.BUILD_ENV': 'window.__REPRO_ENV.BUILD_ENV',
    'process.env.REPRO_WORKSPACE_URL': 'window.__REPRO_ENV.REPRO_WORKSPACE_URL',
    'process.env.REPRO_ADMIN_URL': 'window.__REPRO_ENV.REPRO_ADMIN_URL',
    'process.env.REPRO_API_URL': 'window.__REPRO_ENV.REPRO_API_URL',
  },

  server: {
    host: process.env.HOST || 'localhost',
    port: Number(process.env.PORT) || 8081,
    strictPort: true,
    allowedHosts: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    target: 'esnext',
  },
}))
