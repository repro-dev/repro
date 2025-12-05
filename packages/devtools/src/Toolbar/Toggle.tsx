import { Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import React from 'react'
import { useInspecting } from '../hooks'

export const Toggle: React.FC = () => {
  const [inspecting, setInspecting] = useInspecting()

  return (
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={4}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        hoverBackgroundColor={colors.slate['100']}
        color={colors.blue['700']}
        borderRadius={4}
        transition="all linear 250ms"
        props={{
          onClick: () => setInspecting(inspecting => !inspecting),
        }}
      >
        {inspecting ? (
          <ChevronDownIcon size={14} />
        ) : (
          <ChevronUpIcon size={14} />
        )}
      </Row>
    </Row>
  )
}
