import { Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import React from 'react'
import { useInspecting } from '../hooks'

export const Toggle: React.FC = () => {
  const [inspecting, setInspecting] = useInspecting()

  return (
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={10}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        color={colors.blue['700']}
        props={{
          onClick: () => setInspecting(inspecting => !inspecting),
        }}
      >
        {inspecting ? (
          <ChevronDownIcon size={16} />
        ) : (
          <ChevronUpIcon size={16} />
        )}
      </Row>
    </Row>
  )
}
