import { getElementCSSRules } from '@repro/testing-utils'
import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { lineHeight } from '../tokens/typography'
import { DefinitionList } from './DefinitionList'

afterEach(cleanup)

describe('DefinitionList', () => {
  // Long values must use a relaxed line height for readability (REP-1656
  // tight-leading finding on DefinitionList-LongValues); short terms stay at
  // the heading-tight default.
  it('uses a relaxed line height on values and the standard one on terms', () => {
    const { container } = render(
      <DefinitionList
        title="Session metadata"
        pairs={[
          [
            'Location',
            'A deliberately long value spanning more than fifty characters to trigger the readability rule',
          ],
        ]}
      />
    )

    const blocks = Array.from(container.querySelectorAll('div'))
    const valueBlock = blocks.find(node =>
      (node.textContent ?? '').includes('deliberately long value')
    )
    const termBlock = blocks.find(
      node => (node.textContent ?? '') === 'Location'
    )

    const valueCSS = getElementCSSRules(valueBlock!)
      .map(({ cssText }) => cssText)
      .join('\n')
    const termCSS = getElementCSSRules(termBlock!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(valueCSS).toContain(`line-height: ${lineHeight.relaxed}`)
    expect(termCSS).toContain(`line-height: ${lineHeight.normal}`)
  })
})
