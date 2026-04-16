import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

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
  it('resolves the app URL on the server and passes it to HeroSection', async t => {
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
    const markup = renderToStaticMarkup(element)

    assert.equal(createEnv.mock.calls.length, 1)
    assert.equal(element.props.appUrl, 'https://app.example.test')
    assert.match(markup, /href="https:\/\/app\.example\.test"/)
  })
})
