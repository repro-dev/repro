import { Block, InlineBlock } from '@jsxstyle/react'
import {
  createCSSPropertyMap,
  createGroupedCSSPropertyMap,
  CSSPropertyMap,
  GroupedCSSPropertyMap,
  useReferenceStyle,
} from '@repro/css-utils'
import { color, fontSize, fontWeight, lineHeight, spacing } from '@repro/design'
import { isElementNode } from '@repro/dom-utils'
import { useElapsed, useLatestControlFrame } from '@repro/playback'
import React, { useEffect, useState } from 'react'
import { useSelectedElement } from '../hooks'

export const SelectedNodeComputedStyle: React.FC = () => {
  const selectedElement = useSelectedElement()
  const latestControlFrame = useLatestControlFrame()
  const elapsed = useElapsed()
  const getReferenceStyle = useReferenceStyle()
  const [styleMaps, setStyleMaps] = useState<GroupedCSSPropertyMap[] | null>(
    null
  )

  useEffect(() => {
    if (!selectedElement) {
      setStyleMaps(null)
      return
    }

    if (!isElementNode(selectedElement)) {
      setStyleMaps(null)
      return
    }

    const doc = selectedElement.ownerDocument
    const win = doc ? doc.defaultView : null
    const computedStyle = win ? win.getComputedStyle(selectedElement) : null

    const referenceStyleMap = getReferenceStyle(selectedElement.nodeName)
    const computedStyleMap = computedStyle
      ? createCSSPropertyMap(computedStyle)
      : null

    const filteredStyleMap: CSSPropertyMap = {}

    if (computedStyleMap && referenceStyleMap) {
      for (const [key, value] of Object.entries(computedStyleMap)) {
        if (value !== referenceStyleMap[key]) {
          filteredStyleMap[key] = value
        }
      }
    }

    const groupedStyleMap = createGroupedCSSPropertyMap(filteredStyleMap)

    setStyleMaps(groupedStyleMap)
  }, [selectedElement, latestControlFrame, setStyleMaps])

  useEffect(() => {
    if (styleMaps) {
      /**
      console.log('margin', getMargin(styleMap))
      console.log('padding', getPadding(styleMap))
      console.log('border', getBorder(styleMap))
      /**/
    }
  }, [styleMaps, elapsed])

  return styleMaps ? (
    <Block padding={spacing.xl}>
      {styleMaps.map(({ name, propertyMap }, i) => {
        const propertyKeys = Object.keys(propertyMap).sort((a, b) =>
          a < b ? -1 : 1
        )

        if (!propertyKeys.length) {
          return <React.Fragment key={name} />
        }

        return (
          <Block
            key={name}
            component="details"
            paddingTop={i > 0 ? spacing.xl : spacing.none}
            paddingBottom={spacing.xl}
            borderTop={i > 0 ? `1px solid ${color.border.default}` : ''}
            props={{ open: true }}
          >
            <Block
              component="summary"
              display="list-item"
              paddingBottom={spacing.md}
              textTransform="uppercase"
              fontSize={fontSize.xs}
              fontWeight={fontWeight.bold}
              color={color.text.secondary}
              userSelect="none"
              props={{ tabIndex: -1 }}
            >
              {name}
            </Block>

            {propertyKeys.map(key => (
              <Block
                key={key}
                fontFamily="monospace"
                fontSize={fontSize.xs}
                lineHeight={lineHeight.relaxed}
              >
                <InlineBlock color={color.danger}>{key}:</InlineBlock>
                <InlineBlock
                  color={color.text.secondary}
                  marginLeft={spacing.md}
                >
                  {propertyMap[key]};
                </InlineBlock>
              </Block>
            ))}
          </Block>
        )
      })}
    </Block>
  ) : null
}
