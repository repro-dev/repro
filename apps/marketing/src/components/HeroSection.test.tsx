import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'

function registerUiMocks(t: any) {
  t.mock.module('@jsxstyle/react', {
    namedExports: {
      Block: ({ children, component = 'div', props = {} }: any) =>
        React.createElement(component, props, children),
      Col: ({ children, component = 'div', props = {} }: any) =>
        React.createElement(component, props, children),
      Row: ({ children, component = 'div', props = {} }: any) =>
        React.createElement(component, props, children),
    },
  })

  t.mock.module('@repro/design', {
    namedExports: {
      Logo: () => React.createElement('div'),
      color: {
        bg: { surface: '#fff' },
        border: { default: '#ddd', strong: '#999' },
        info: '#06f',
        primaryHover: '#05c',
        text: { default: '#111', inverse: '#fff', secondary: '#666' },
      },
      radius: { md: '8px' },
      spacing: { lg: '24px', md: '16px', sm: '8px', xl: '32px' },
      textStyles: { body: {}, heading1: {}, label: {} },
      transition: { default: 'none' },
    },
  })
}

describe('HeroSection', () => {
  it('renders the app CTA href from props', async t => {
    registerUiMocks(t)

    const { HeroSection } = await import('./HeroSection')

    const markup = renderToStaticMarkup(
      React.createElement(HeroSection, {
        appUrl: 'https://app.repro.localhost:1355',
      })
    )

    assert.match(markup, /href="https:\/\/app\.repro\.localhost:1355"/)
  })
})

describe('HomePage', () => {
  it('hydrates the home page route without changing the CTA href', async t => {
    registerUiMocks(t)

    const createEnv = t.mock.fn(() => ({
      REPRO_APP_URL: 'https://app.example.test',
    }))

    t.mock.module('~/config/env', {
      namedExports: {
        createEnv,
      },
    })

    const { default: HomePage } = await import('../app/page')
    const element = HomePage()
    const markup = renderToString(element)
    const consoleError = t.mock.method(console, 'error', () => {})

    const container = document.createElement('div')
    container.innerHTML = markup

    const beforeHref = container
      .querySelector('a[href^="https://app.example.test"]')
      ?.getAttribute('href')

    const root = hydrateRoot(container, element)

    await new Promise(resolve => setTimeout(resolve, 0))

    const afterHref = container
      .querySelector('a[href^="https://app.example.test"]')
      ?.getAttribute('href')

    assert.equal(createEnv.mock.calls.length, 1)
    assert.equal(beforeHref, 'https://app.example.test')
    assert.equal(afterHref, 'https://app.example.test')
    assert.equal(consoleError.mock.calls.length, 0)

    root.unmount()
  })
})
