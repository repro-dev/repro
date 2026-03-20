import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, Plugin } from 'vite'

function htmlEnvPlugin(envVars: Record<string, string>): Plugin {
  return {
    name: 'html-env',
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
            const value = process.env[name]
            if (value) {
              html = html.replaceAll(value, `$${name}`)
            }
          }
          const templateName = fileName.replace('.html', '.template.html')
          this.emitFile({
            type: 'asset',
            fileName: templateName,
            source: html,
          })
        }
      }
    },
  }
}

const envVarNames = ['BUILD_ENV', 'REPRO_APP_URL', 'REPRO_API_URL']

const envVars = Object.fromEntries(
  envVarNames.map(name => [name, process.env[name] ?? ''])
)

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    htmlEnvPlugin(envVars),
    htmlTemplatePlugin(envVarNames),
  ],

  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    host: process.env.HOST || 'localhost',
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    allowedHosts: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    target: 'esnext',
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        apiBridge: path.resolve(__dirname, 'apiBridge.html'),
      },
    },
  },
}))
