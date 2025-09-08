import { InlineRow } from '@jsxstyle/react'
import { CircleIcon } from 'lucide-react'
import React from 'react'
import { Tooltip } from '../Tooltip'
import { colors } from '../theme'

export const BreakpointAction: React.FC<{
  active: boolean
  onClick: () => void
}> = ({ active, onClick }) => (
  <InlineRow
    position="absolute"
    top={0}
    left={0}
    alignItems="center"
    padding={3}
    backgroundColor={active ? colors.pink['500'] : 'transparent'}
    color={active ? colors.pink['50'] : colors.blue['300']}
    hoverColor={active ? colors.pink['50'] : colors.blue['700']}
    borderStartEndRadius={4}
    borderEndEndRadius={4}
    lineHeight={1.25}
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
