import { Block, InlineBlock } from '@jsxstyle/react'
import {
  createCSSPropertyMap,
  createGroupedCSSPropertyMap,
  CSSPropertyMap,
  GroupedCSSPropertyMap,
  useReferenceStyle,
} from '@repro/css-utils'
import { colors } from '@repro/design'
import { isElementNode } from '@repro/dom-utils'
import { useElapsed, useLatestControlFrame } from '@repro/playback'
import React, { useEffect, useState } from 'react'
import { useSelectedElement } from '../hooks'

export const SelectedNodeComputedStyle: React.FC = () => {
  const selectedElement = useSelectedElement()
  const latestControlFrame = useLatestControlFrame()
  const elapsed = useElapsed()
  const getReferenceStyle = useReferenceStyle()
  const [styleMaps, setStyleMaps] =
    useState<Array<GroupedCSSPropertyMap> | null>(null)

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
    <Block padding={16}>
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
            paddingTop={i > 0 ? 16 : 0}
            paddingBottom={16}
            borderTop={i > 0 ? `1px solid ${colors.slate['200']}` : ''}
            props={{ open: true }}
          >
            <Block
              component="summary"
              display="list-item"
              paddingBottom={8}
              textTransform="uppercase"
              fontSize={13}
              fontWeight={700}
              color={colors.slate['700']}
              userSelect="none"
              props={{ tabIndex: -1 }}
            >
              {name}
            </Block>

            {propertyKeys.map(key => (
              <Block
                key={key}
                fontFamily="monospace"
                fontSize={12}
                lineHeight={1.5}
              >
                <InlineBlock color={colors.rose['500']}>{key}:</InlineBlock>
                <InlineBlock color={colors.slate['700']} marginLeft={8}>
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
