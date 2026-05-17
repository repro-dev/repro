import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import adminViteConfig from '../vite.config'

describe('admin vite config', () => {
  it('replaces env placeholders during dev HTML transforms', () => {
    type EnvKey =
      | 'BUILD_ENV'
      | 'REPRO_WORKSPACE_URL'
      | 'REPRO_ADMIN_URL'
      | 'REPRO_API_URL'

    function restore(name: EnvKey, value: string | undefined) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }

    const originalEnv = {
      BUILD_ENV: process.env.BUILD_ENV,
      REPRO_WORKSPACE_URL: process.env.REPRO_WORKSPACE_URL,
      REPRO_ADMIN_URL: process.env.REPRO_ADMIN_URL,
      REPRO_API_URL: process.env.REPRO_API_URL,
    }

    process.env.BUILD_ENV = 'development'
    process.env.REPRO_WORKSPACE_URL = 'https://app.localhost'
    process.env.REPRO_ADMIN_URL = 'https://admin.localhost'
    process.env.REPRO_API_URL = 'https://api.localhost'

    try {
      const config = adminViteConfig({ mode: 'development' } as never)
      const plugins = (config.plugins ?? []) as Array<{
        name: string
        transformIndexHtml?: {
          handler?: (html: string) => string
        }
        generateBundle?: (...args: Array<unknown>) => void
      }>
      const htmlEnvPlugin = plugins.find(plugin => plugin.name === 'html-env')

      assert.ok(htmlEnvPlugin)
      assert.equal(
        htmlEnvPlugin?.transformIndexHtml?.handler?.(
          '<script>window.__REPRO_ENV = { BUILD_ENV: "%BUILD_ENV%", REPRO_WORKSPACE_URL: "%REPRO_WORKSPACE_URL%", REPRO_ADMIN_URL: "%REPRO_ADMIN_URL%", REPRO_API_URL: "%REPRO_API_URL%" }</script>'
        ),
        '<script>window.__REPRO_ENV = { BUILD_ENV: "development", REPRO_WORKSPACE_URL: "https://app.localhost", REPRO_ADMIN_URL: "https://admin.localhost", REPRO_API_URL: "https://api.localhost" }</script>'
      )
    } finally {
      restore('BUILD_ENV', originalEnv.BUILD_ENV)
      restore('REPRO_WORKSPACE_URL', originalEnv.REPRO_WORKSPACE_URL)
      restore('REPRO_ADMIN_URL', originalEnv.REPRO_ADMIN_URL)
      restore('REPRO_API_URL', originalEnv.REPRO_API_URL)
    }
  })

  it('emits template HTML for deploy-time envsubst', () => {
    const config = adminViteConfig({ mode: 'production' } as never)
    const plugins = (config.plugins ?? []) as Array<{
      name: string
      transformIndexHtml?: {
        handler?: (html: string) => string
      }
      generateBundle?: (...args: Array<unknown>) => void
    }>
    const htmlTemplatePlugin = plugins.find(
      plugin => plugin.name === 'html-template'
    )

    assert.ok(htmlTemplatePlugin)

    const emittedFiles: Array<{ fileName: string; source: string }> = []

    htmlTemplatePlugin?.generateBundle?.call(
      {
        emitFile(file: { fileName: string; source: string }) {
          emittedFiles.push(file)
        },
      },
      {},
      {
        'index.html': {
          type: 'asset',
          source:
            '<script>window.__REPRO_ENV = { BUILD_ENV: "%BUILD_ENV%", REPRO_WORKSPACE_URL: "%REPRO_WORKSPACE_URL%", REPRO_ADMIN_URL: "%REPRO_ADMIN_URL%", REPRO_API_URL: "%REPRO_API_URL%" }</script>',
        },
      }
    )

    assert.deepEqual(emittedFiles, [
      {
        type: 'asset',
        fileName: 'index.template.html',
        source:
          '<script>window.__REPRO_ENV = { BUILD_ENV: "$BUILD_ENV", REPRO_WORKSPACE_URL: "$REPRO_WORKSPACE_URL", REPRO_ADMIN_URL: "$REPRO_ADMIN_URL", REPRO_API_URL: "$REPRO_API_URL" }</script>',
      },
    ])
  })

  it('keeps the runtime env placeholders in index.html', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')

    assert.match(html, /%BUILD_ENV%/)
    assert.match(html, /%REPRO_WORKSPACE_URL%/)
    assert.match(html, /%REPRO_ADMIN_URL%/)
    assert.match(html, /%REPRO_API_URL%/)
  })
})
