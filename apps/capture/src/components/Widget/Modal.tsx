import { Block, InlineBlock, Row } from '@jsxstyle/react'
import { animated, config, useTransition } from '@react-spring/web'
import { color, Logo, spacing } from '@repro/design'
import { XIcon } from 'lucide-react'
import React from 'react'

export interface ModalProps {
  size?: 'compact' | 'normal' | 'full-screen'
  title?: React.ReactNode
  headerActions?: React.ReactNode
  open?: boolean
  onClose?: () => void
}

const defaultStyles = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  transformOrigin: 'bottom left',
} as const

export const Modal: React.FC<React.PropsWithChildren<ModalProps>> = ({
  children,
  title,
  headerActions,
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
          <animated.div style={{ ...styles, ...defaultStyles, zIndex: 1 }}>
            <Block
              blockSize={
                size === 'full-screen' ? 'calc(100vh - 110px)' : 'auto'
              }
              inlineSize={
                size === 'full-screen' ? 'calc(100vw - 40px)' : 'auto'
              }
              backgroundColor={color.bg.surface}
              boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
              borderRadius={8}
              border={`1px solid ${color.infoFg}`}
              overflow="hidden"
            >
              {size !== 'compact' && (
                <Block
                  paddingBlock={spacing.lg}
                  paddingInline={spacing.xl}
                  height={120}
                  backgroundColor={color.primaryHover}
                  backgroundImage={`linear-gradient(to bottom right, ${color.infoFg}, ${color.primary})`}
                >
                  <Row alignItems="center" gap={spacing.lg}>
                    <Logo size={24} inverted={true} />

                    {title && (
                      <InlineBlock color={color.text.inverse} fontSize={16}>
                        {title}
                      </InlineBlock>
                    )}

                    {/* eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-spacing -- auto is a flex keyword, not a pixel value */}
                    <Row alignItems="center" gap={spacing.xl} marginLeft="auto">
                      {headerActions}

                      {onClose && (
                        <Row
                          alignItems="center"
                          padding={spacing.sm}
                          transform="translateX(10px)"
                          color={color.infoTint}
                          hoverBackgroundColor={color.infoFg}
                          borderRadius={2}
                          transition="all 100ms ease-in-out"
                          lineHeight={1}
                          cursor="pointer"
                          props={{ onClick: onClose }}
                        >
                          <XIcon />
                        </Row>
                      )}
                    </Row>
                  </Row>
                </Block>
              )}

              <Block
                marginTop={
                  size !== 'compact'
                    ? -(spacing['4xl'] + spacing['2xl'] + spacing.sm)
                    : 'auto'
                }
                padding={spacing.xl}
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
