import { Block, Col, Row } from '@jsxstyle/react'
import {
  Box,
  createCSSPropertyMap,
  getBorder,
  getMargin,
  getPadding,
  resolveValue,
} from '@repro/css-utils'
import { color, colors, fontSize, fontWeight, spacing } from '@repro/design'
import { isElementNode } from '@repro/dom-utils'
import { useLatestControlFrame } from '@repro/playback'
import React, { useEffect, useState } from 'react'
import { useSelectedElement } from '../hooks'

/* eslint-disable @repro/oxlint-plugin-design/no-raw-palette */
/**
 * Box model region colors — drawn from the Tailwind palette via @repro/design.
 * The colors palette is explicitly permitted for the element inspector per the
 * REP-1381 plan, matching the precedent in SelectedNodeComputedStyle.tsx which
 * uses colors.rose['500'].
 */
const BOX_MODEL_COLORS = {
  margin: colors.amber['100'],
  border: colors.amber['300'],
  padding: colors.green['100'],
  content: colors.blue['100'],
} as const
/* eslint-enable @repro/oxlint-plugin-design/no-raw-palette */

interface BoxModelState {
  margin: Box
  border: Box
  padding: Box
  contentWidth: number
  contentHeight: number
  boxSizing: string
}

const regionLabelStyle = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.bold,
  color: color.text.secondary,
  fontFamily: 'monospace',
  userSelect: 'none' as const,
}

const edgeLabelBaseStyle = {
  fontSize: fontSize.xs,
  fontFamily: 'monospace',
}

const EdgeLabel: React.FC<{ value: number }> = ({ value }) => (
  <Block
    {...edgeLabelBaseStyle}
    color={value === 0 ? color.text.muted : color.text.secondary}
    padding={spacing.xs}
    textAlign="center"
  >
    {value}px
  </Block>
)

const RegionLayer: React.FC<{
  box: Box
  label: string
  bgColor: string
  children?: React.ReactNode
}> = ({ box, label, bgColor, children }) => {
  const hasVisible =
    box.top > 0 || box.bottom > 0 || box.left > 0 || box.right > 0
  const allZero =
    box.top === 0 && box.bottom === 0 && box.left === 0 && box.right === 0

  if (allZero) {
    return (
      <Block backgroundColor={bgColor} padding={spacing.xs}>
        {children ? (
          children
        ) : (
          <Block {...regionLabelStyle} textAlign="center" padding={spacing.sm}>
            {label} (0)
          </Block>
        )}
      </Block>
    )
  }

  return (
    <Block backgroundColor={bgColor} padding={spacing.xs}>
      <Col>
        {hasVisible && (
          <Row justifyContent="center">
            <EdgeLabel value={box.top} />
          </Row>
        )}
        <Row alignItems="stretch">
          {hasVisible && (
            <Col alignItems="center" justifyContent="center">
              <EdgeLabel value={box.left} />
            </Col>
          )}
          <Block flex="1" minWidth={0}>
            {children ? (
              children
            ) : (
              <Block
                {...regionLabelStyle}
                textAlign="center"
                padding={spacing.sm}
              >
                {label}
              </Block>
            )}
          </Block>
          {hasVisible && (
            <Col alignItems="center" justifyContent="center">
              <EdgeLabel value={box.right} />
            </Col>
          )}
        </Row>
        {hasVisible && (
          <Row justifyContent="center">
            <EdgeLabel value={box.bottom} />
          </Row>
        )}
      </Col>
    </Block>
  )
}

const ContentRegion: React.FC<{
  width: number
  height: number
}> = ({ width, height }) => (
  <Block
    backgroundColor={BOX_MODEL_COLORS.content}
    padding={spacing.lg}
    textAlign="center"
  >
    <Block
      fontFamily="monospace"
      fontSize={fontSize.xs}
      color={color.text.secondary}
      fontWeight={fontWeight.bold}
      userSelect="none"
    >
      {width} × {height}
    </Block>
  </Block>
)

export const SelectedNodeBoxModel: React.FC = () => {
  const selectedElement = useSelectedElement()
  const latestControlFrame = useLatestControlFrame()
  const [state, setState] = useState<BoxModelState | null>(null)

  useEffect(() => {
    if (!selectedElement) {
      setState(null)
      return
    }

    if (!isElementNode(selectedElement)) {
      setState(null)
      return
    }

    const doc = selectedElement.ownerDocument
    const win = doc ? doc.defaultView : null
    const computedStyle = win ? win.getComputedStyle(selectedElement) : null

    if (!computedStyle) {
      setState(null)
      return
    }

    const styleMap = createCSSPropertyMap(computedStyle)

    setState({
      margin: getMargin(styleMap),
      border: getBorder(styleMap),
      padding: getPadding(styleMap),
      contentWidth: resolveValue(styleMap['width']),
      contentHeight: resolveValue(styleMap['height']),
      boxSizing: styleMap['box-sizing'] ?? 'content-box',
    })
  }, [selectedElement, latestControlFrame])

  if (!state) {
    return null
  }

  return (
    <Block padding={spacing.md}>
      <Block
        fontFamily="monospace"
        fontSize={fontSize.xs}
        color={color.text.secondary}
        textAlign="center"
        paddingBottom={spacing.sm}
        userSelect="none"
      >
        box-sizing: {state.boxSizing}
      </Block>

      <RegionLayer
        box={state.margin}
        label="margin"
        bgColor={BOX_MODEL_COLORS.margin}
      >
        <RegionLayer
          box={state.border}
          label="border"
          bgColor={BOX_MODEL_COLORS.border}
        >
          <RegionLayer
            box={state.padding}
            label="padding"
            bgColor={BOX_MODEL_COLORS.padding}
          >
            <ContentRegion
              width={state.contentWidth}
              height={state.contentHeight}
            />
          </RegionLayer>
        </RegionLayer>
      </RegionLayer>
    </Block>
  )
}
