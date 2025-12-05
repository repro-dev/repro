import { Block, Row } from '@jsxstyle/react'
import { colors, Tooltip } from '@repro/design'
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
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={4}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        color={picker ? colors.pink['500'] : colors.blue['700']}
        backgroundColor={picker ? colors.pink['100'] : 'transparent'}
        hoverBackgroundColor={picker ? colors.pink['100'] : colors.slate['100']}
        borderRadius={4}
        transition="all linear 250ms"
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
