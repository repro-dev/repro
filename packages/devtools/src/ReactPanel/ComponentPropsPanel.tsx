import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import React from 'react'
import { JSONView } from '../JSONView/JSONView'

interface Props {
  node: ReactComponentNode | null
}

export const ComponentPropsPanel: React.FC<Props> = ({ node }) => {
  if (!node) {
    return (
      <Block padding={16} fontSize={12} color={colors.slate['400']}>
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
    <Block padding={8}>
      <Block
        fontSize={11}
        fontWeight={600}
        color={colors.violet['700']}
        marginBottom={8}
        paddingBottom={4}
        borderBottom={`1px solid ${colors.slate['200']}`}
      >
        &lt;{node.componentName}&gt;
      </Block>
      <JSONView data={propsData} />
    </Block>
  )
}
