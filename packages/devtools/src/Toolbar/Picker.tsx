import { Block, Row } from '@jsxstyle/react'
import { color, spacing, Tooltip, transition } from '@repro/design'
import { Inspect as PickerIcon } from 'lucide-react'
import React, { useCallback, useEffect } from 'react'
import { useElementPicker, useInspecting } from '../hooks'
export const Picker: React.FC = () => {
  const [picker, setPicker] = useElementPicker()
  const [inspecting] = useInspecting()

  const togglePicker = useCallback(() => {
    setPicker(picker => !picker)
  }, [setPicker])

  useEffect(() => {
    if (!inspecting) {
      setPicker(false)
    }
  }, [inspecting, setPicker])

  return (
    <Row
      position="relative"
      alignItems="center"
      cursor="pointer"
      paddingH={spacing.sm}
    >
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        color={color.primary}
        backgroundColor={picker ? color.primarySubtle : 'transparent'}
        hoverBackgroundColor={picker ? color.primarySubtle : color.bg.hover}
        borderRadius={4}
        transition={transition.default}
        props={{ onClick: togglePicker }}
      >
        <Block>
          <Tooltip position="top">Select element</Tooltip>
          <PickerIcon size={14} />
        </Block>
      </Row>
    </Row>
  )
}
