import { Block, Row } from '@jsxstyle/react'
import { X as CloseIcon } from 'lucide-react'
import React, { PropsWithChildren } from 'react'
import { Portal } from '../Portal'
import { colors } from '../theme'

interface Props {
  open: boolean
  onClose(): void
}

export const Drawer: React.FC<PropsWithChildren<Props>> = ({
  children,
  open,
  onClose,
}) => (
  <Portal>
    <Backdrop active={open}>
      <Block
        position="absolute"
        top={0}
        bottom={0}
        right={0}
        width="35vw"
        minWidth={480}
        padding={30}
        overflow="hidden"
        backgroundColor={colors.white}
        transform={open ? 'translateX(0)' : 'translateX(100%)'}
        transition={
          open
            ? 'transform 100ms ease-in-out 250ms'
            : 'transform 100ms ease-in-out'
        }
      >
        <Row
          position="absolute"
          top={10}
          right={10}
          width={32}
          height={32}
          alignItems="center"
          justifyContent="center"
          hoverBackgroundColor={colors.slate['100']}
          borderRadius="99rem"
          cursor="pointer"
          props={{ onClick: onClose }}
        >
          <CloseIcon size={16} />
        </Row>

        {open && children}
      </Block>
    </Backdrop>
  </Portal>
)

interface BackdropProps {
  active: boolean
}

const Backdrop: React.FC<PropsWithChildren<BackdropProps>> = ({
  children,
  active,
}) => {
  return (
    <Block
      background="rgba(0, 0, 0, 0.75)"
      position="fixed"
      top={0}
      left={0}
      bottom={0}
      right={0}
      opacity={active ? 1 : 0}
      pointerEvents={active ? 'all' : 'none'}
      transition={
        active ? 'opacity 250ms ease-in-out' : 'opacity 250ms ease-in-out 100ms'
      }
    >
      {children}
    </Block>
  )
}
