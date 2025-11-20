import { Block, InlineBlock, Row } from '@jsxstyle/react'
import { colors, Logo } from '@repro/design'
import { XIcon } from 'lucide-react'
import React, { PropsWithChildren } from 'react'

interface Props {
  size?: 'compact' | 'normal' | 'full-screen'
  title?: string
  onClose?: () => void
}

export const Modal: React.FC<PropsWithChildren<Props>> = ({
  children,
  title,
  onClose,
  size = 'normal',
}) => {
  return (
    <Block
      position="absolute"
      top={0}
      left={0}
      height={size === 'full-screen' ? 'calc(100vh - 130px)' : 'auto'}
      width={size === 'full-screen' ? 'calc(100vw - 140px)' : 'auto'}
      transform="translate(20px, calc(-100% - 30px))"
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
  )
}
