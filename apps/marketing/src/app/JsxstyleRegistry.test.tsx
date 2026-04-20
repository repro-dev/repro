import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteLayout } from '~/components/SiteLayout'

describe('JsxstyleRegistry', () => {
  it('flushes shell styles and resets cleanly between renders', async t => {
    const insertedHtmlCallbacks: Array<() => ReactNode> = []

    t.mock.module('next/navigation', {
      namedExports: {
        useServerInsertedHTML(callback: () => ReactNode) {
          insertedHtmlCallbacks.push(callback)
        },
      },
    })

    const { JsxstyleRegistry } = await import('./JsxstyleRegistry')

    const renderShell = () => {
      insertedHtmlCallbacks.length = 0

      renderToStaticMarkup(
        <JsxstyleRegistry>
          <SiteLayout>
            <div>Page content</div>
          </SiteLayout>
        </JsxstyleRegistry>
      )

      const callback = insertedHtmlCallbacks[insertedHtmlCallbacks.length - 1]

      assert.ok(callback)

      const styleMarkup = renderToStaticMarkup(<>{callback()}</>)

      assert.match(styleMarkup, /background-color:/i)
      assert.match(styleMarkup, /min-height:100vh/i)

      return styleMarkup
    }

    const firstPass = renderShell()
    const secondPass = renderShell()

    assert.equal(firstPass.length > 0, true)
    assert.equal(secondPass.length > 0, true)
  })
})
