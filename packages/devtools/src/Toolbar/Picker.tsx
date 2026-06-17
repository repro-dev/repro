import { Block, Row } from '@jsxstyle/react'
import { color, colors, Tooltip, transition } from '@repro/design'
import { Inspect as PickerIcon } from 'lucide-react'
import React, { useCallback, useEffect } from 'react'
import { useElementPicker, useInspecting } from '../hooks'
/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing, @repro/oxlint-plugin-design/no-raw-palette */

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
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={4}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        color={picker ? colors.pink['500'] : color.primary}
        backgroundColor={picker ? colors.pink['100'] : 'transparent'}
        hoverBackgroundColor={picker ? colors.pink['100'] : color.bg.hover}
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
/* eslint-enable */
