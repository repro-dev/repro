import { Block, InlineBlock } from '@jsxstyle/react'
import { formatDate } from '@repro/date-utils'
import { color, Drawer, spacing } from '@repro/design'
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
      paddingH={spacing.xl}
      paddingBottom={spacing.xl}
      boxShadow={`0 4px 16px ${color.border.default}`}
      borderBottom={`1px solid ${color.border.default}`}
    >
      <Block fontSize={20} lineHeight={1.25}>
        {info.title}
      </Block>

      <Block
        component="a"
        marginTop={spacing.lg}
        fontSize={13}
        textDecoration="underline"
        lineHeight={1.25}
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
        fontSize={13}
        lineHeight={1.25}
        color={color.text.secondary}
      >
        Posted on {formatDate(info.createdAt)}
      </Block>

      <Block
        marginTop={spacing.lg}
        lineHeight={1.5}
        fontSize={13}
        textOverflow="ellipsis"
        emptyDisplay="none"
      >
        {description}

        {shouldTruncateDescription && (
          <InlineBlock
            marginLeft={spacing.sm}
            fontWeight={700}
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
              <Block fontSize={24} fontWeight={700} color={color.text.default}>
                {info.title}
              </Block>

              <Block
                component="a"
                marginTop={spacing.xl}
                fontSize={15}
                textDecoration="underline"
                color={color.primary}
                cursor="pointer"
                props={{ href: info.url, target: '_blank' }}
              >
                {info.url}
              </Block>

              <Block
                marginTop={spacing.lg}
                fontSize={15}
                lineHeight={1.25}
                color={color.text.secondary}
              >
                Posted on {formatDate(info.createdAt)}
              </Block>

              <Block
                marginTop={spacing.xl}
                fontSize={13}
                lineHeight={1.5}
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
