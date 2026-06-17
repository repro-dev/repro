import { Block, InlineBlock } from '@jsxstyle/react'
import { formatDate } from '@repro/date-utils'
import {
  Drawer,
  color,
  fontSize,
  fontWeight,
  lineHeight,
  spacing,
} from '@repro/design'
import { RecordingInfo } from '@repro/domain'
import React, { Fragment, useState } from 'react'

interface Props {
  info: RecordingInfo
}

const DESCRIPTION_LENGTH = 360

export const Summary: React.FC<Props> = ({ info }) => {
  const [showDrawer, setShowDrawer] = useState(false)

  const shouldTruncateDescription = info.description.length > DESCRIPTION_LENGTH

  let description = info.description

  if (shouldTruncateDescription) {
    description = description.slice(0, 360) + '...'
  }

  return (
    <Block
      isolation="isolate"
      paddingH={spacing['2xl']}
      paddingBottom={spacing['2xl']}
      boxShadow={`0 4px 16px ${color.border.default}`}
      borderBottom={`1px solid ${color.border.default}`}
    >
      <Block fontSize={fontSize.lg} lineHeight={lineHeight.normal}>
        {info.title}
      </Block>

      <Block
        component="a"
        marginTop={spacing.lg}
        fontSize={fontSize.sm}
        textDecoration="underline"
        lineHeight={lineHeight.normal}
        wordBreak="break-all"
        color={color.primary}
        cursor="pointer"
        props={{
          href: info.url,
          target: '_blank',
        }}
      >
        {info.url}
      </Block>

      <Block
        marginTop={spacing.lg}
        fontSize={fontSize.sm}
        lineHeight={lineHeight.normal}
        color={color.text.secondary}
      >
        Posted on {formatDate(info.createdAt)}
      </Block>

      <Block
        marginTop={spacing.lg}
        lineHeight={lineHeight.relaxed}
        fontSize={fontSize.sm}
        textOverflow="ellipsis"
        emptyDisplay="none"
      >
        {description}

        {shouldTruncateDescription && (
          <InlineBlock
            marginLeft={spacing.sm}
            fontWeight={fontWeight.bold}
            color={color.primary}
            cursor="pointer"
            props={{
              onClick: () => setShowDrawer(true),
            }}
          >
            Read More
          </InlineBlock>
        )}

        <Drawer open={showDrawer} onClose={() => setShowDrawer(false)}>
          {showDrawer && (
            <Fragment>
              <Block
                fontSize={fontSize.xl}
                fontWeight={fontWeight.bold}
                color={color.text.default}
              >
                {info.title}
              </Block>

              <Block
                component="a"
                marginTop={spacing['2xl']}
                fontSize={fontSize.base}
                textDecoration="underline"
                color={color.primary}
                cursor="pointer"
                props={{ href: info.url, target: '_blank' }}
              >
                {info.url}
              </Block>

              <Block
                marginTop={spacing.lg}
                fontSize={fontSize.base}
                lineHeight={lineHeight.normal}
                color={color.text.secondary}
              >
                Posted on {formatDate(info.createdAt)}
              </Block>

              <Block
                marginTop={spacing['2xl']}
                fontSize={fontSize.sm}
                lineHeight={lineHeight.relaxed}
                whiteSpace="pre-wrap"
              >
                {info.description}
              </Block>
            </Fragment>
          )}
        </Drawer>
      </Block>
    </Block>
  )
}
