import { InlineRow } from '@jsxstyle/react'
import { Tooltip, color, lineHeight, spacing } from '@repro/design'
import { CircleIcon } from 'lucide-react'
import React from 'react'
export const BreakpointAction: React.FC<{
  active: boolean
  onClick: () => void
}> = ({ active, onClick }) => (
  <InlineRow
    position="absolute"
    top={0}
    left={0}
    alignItems="center"
    padding={spacing.xs}
    backgroundColor={active ? color.primary : 'transparent'}
    color={active ? color.primarySubtle : color.infoBorder}
    hoverColor={active ? color.primarySubtle : color.info}
    borderStartEndRadius={4}
    borderEndEndRadius={4}
    lineHeight={lineHeight.normal}
    cursor="pointer"
    props={{ onClick }}
  >
    <CircleIcon
      size={12}
      fill={active ? 'currentColor' : 'none'}
      stroke={active ? 'none' : 'currentColor'}
    />

    <Tooltip position="right">
      {active ? 'Remove breakpoint' : 'Add breakpoint'}
    </Tooltip>
  </InlineRow>
)
