import { Row } from '@jsxstyle/react'
import { color, transition } from '@repro/design'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import React from 'react'
import { useInspecting } from '../hooks'
/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */

export const Toggle: React.FC = () => {
  const [inspecting, setInspecting] = useInspecting()

  return (
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={4}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        hoverBackgroundColor={color.bg.hover}
        color={color.primary}
        borderRadius={4}
        transition={transition.default}
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
/* eslint-enable */
