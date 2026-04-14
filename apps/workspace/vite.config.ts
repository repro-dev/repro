import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, Plugin } from 'vite'

function htmlEnvPlugin(envVars: Record<string, string>): Plugin {
  return {
    name: 'html-env',
    // Only applies during dev server — replaces %NAME% with the actual value
    // so the dev server serves a fully-resolved HTML page.
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/%(\w+)%/g, (_, key) => envVars[key] ?? '')
      },
    },
  }
}

function antiFramingPlugin(): Plugin {
  return {
    name: 'anti-framing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // apiBridge.html must remain embeddable — skip framing headers for it
        if (req.url && req.url.startsWith('/apiBridge')) {
          return next()
        }
        res.setHeader('X-Frame-Options', 'DENY')
        res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
        next()
      })
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
          // At build time htmlEnvPlugin is not active, so %NAME% placeholders
          // are still present in the HTML. Replace them with $NAME so that
          // prepare-env can run envsubst at deploy time.
          let html = chunk.source as string
          for (const name of envVarNames) {
            html = html.replaceAll(`%${name}%`, `$${name}`)
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

const envVarNames = [
  'BUILD_ENV',
  'PADDLE_CLIENT_TOKEN',
  'PADDLE_ENVIRONMENT',
  'REPRO_APP_URL',
  'REPRO_API_URL',
]

const envVars = Object.fromEntries(
  envVarNames.map(name => [name, process.env[name] ?? ''])
)

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    htmlEnvPlugin(envVars),
    htmlTemplatePlugin(envVarNames),
    antiFramingPlugin(),
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
