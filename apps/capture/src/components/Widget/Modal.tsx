import { Block, InlineBlock, Row } from '@jsxstyle/react'
import { animated, config, useTransition } from '@react-spring/web'
import { color, colors, Logo, Portal } from '@repro/design'
import { XIcon } from 'lucide-react'
import React from 'react'

export interface ModalProps {
  size?: 'compact' | 'normal' | 'full-screen'
  title?: React.ReactNode
  open?: boolean
  onClose?: () => void
}

const defaultStyles = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  transformOrigin: 'bottom left',
} as const

const backdropStyles = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backdropFilter: 'blur(5px)',
  zIndex: 0,
} as const

export const Modal: React.FC<React.PropsWithChildren<ModalProps>> = ({
  children,
  title,
  onClose,
  open = false,
  size = 'normal',
}) => {
  const transition = useTransition(open, {
    from: { scale: 0.8, opacity: 0 },
    enter: { scale: 1, opacity: 1 },
    leave: { scale: 0.8, opacity: 0 },
    config: config.stiff,
  })

  return transition(
    (styles, isOpen) =>
      isOpen && (
        <>
          <Portal>
            <animated.div
              style={{
                ...backdropStyles,
                backgroundColor: color.bg.overlay,
                opacity: styles.opacity,
              }}
              onClick={onClose}
            />
          </Portal>
          <animated.div style={{ ...styles, ...defaultStyles, zIndex: 1 }}>
            <Block
              blockSize={
                size === 'full-screen' ? 'calc(100vh - 110px)' : 'auto'
              }
              inlineSize={
                size === 'full-screen' ? 'calc(100vw - 40px)' : 'auto'
              }
              backgroundColor={colors.white}
              boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
              borderRadius={8}
              border={`1px solid ${colors.blue['900']}`}
              overflow="hidden"
            >
              {size !== 'compact' && (
                <Block
                  paddingBlock={10}
                  paddingInline={20}
                  height={120}
                  backgroundColor={colors.blue['800']}
                  backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
                >
                  <Row alignItems="center" gap={10}>
                    <Logo size={24} inverted={true} />

                    {title && (
                      <InlineBlock color={colors.white} fontSize={16}>
                        {title}
                      </InlineBlock>
                    )}

                    {onClose && (
                      <Row
                        alignItems="center"
                        marginLeft="auto"
                        padding={5}
                        transform="translateX(10px)"
                        color={colors.blue['50']}
                        hoverBackgroundColor={colors.blue['900']}
                        borderRadius={2}
                        transition="all linear 100ms"
                        lineHeight={1}
                        cursor="pointer"
                        props={{ onClick: onClose }}
                      >
                        <XIcon />
                      </Row>
                    )}
                  </Row>
                </Block>
              )}

              <Block
                marginTop={size !== 'compact' ? -75 : 'auto'}
                padding={15}
                height="calc(100% - 45px)"
              >
                {children}
              </Block>
            </Block>
          </animated.div>
        </>
      )
  )
}
