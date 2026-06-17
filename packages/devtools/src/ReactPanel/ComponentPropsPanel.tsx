import { Block } from '@jsxstyle/react'
import { color, fontSize, fontWeight, spacing } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import React from 'react'
import { JSONView } from '../JSONView/JSONView'
interface Props {
  node: ReactComponentNode | null
}

export const ComponentPropsPanel: React.FC<Props> = ({ node }) => {
  if (!node) {
    return (
      <Block
        padding={spacing.xl}
        fontSize={fontSize.sm}
        color={color.text.muted}
      >
        Select a component to view its props.
      </Block>
    )
  }

  let propsData: unknown = {}
  try {
    propsData = JSON.parse(node.props)
  } catch {
    // If props is not valid JSON, show it as a raw string
    propsData = node.props
  }

  return (
    <Block padding={spacing.md}>
      <Block
        fontSize={fontSize.xs}
        fontWeight={fontWeight.semibold}
        color={color.primary}
        marginBottom={spacing.md}
        paddingBottom={spacing.sm}
        borderBottom={`1px solid ${color.border.default}`}
      >
        &lt;{node.componentName}&gt;
      </Block>
      <JSONView data={propsData} />
    </Block>
  )
}
