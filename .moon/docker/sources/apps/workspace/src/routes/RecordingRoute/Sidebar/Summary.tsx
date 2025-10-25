import { formatDate } from '@repro/date-utils'
import { colors, Drawer } from '@repro/design'
import { RecordingInfo } from '@repro/domain'
import { Block, InlineBlock } from '@jsxstyle/react'
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
      paddingH={20}
      paddingBottom={20}
      boxShadow={`0 4px 16px ${colors.slate['200']}`}
      borderBottom={`1px solid ${colors.slate['200']}`}
    >
      <Block fontSize={20} lineHeight={1.25}>
        {info.title}
      </Block>

      <Block
        component="a"
        marginTop={10}
        fontSize={13}
        textDecoration="underline"
        lineHeight={1.25}
        wordBreak="break-all"
        color={colors.blue['700']}
        cursor="pointer"
        props={{
          href: info.url,
          target: '_blank',
        }}
      >
        {info.url}
      </Block>

      <Block
        marginTop={10}
        fontSize={13}
        lineHeight={1.25}
        color={colors.slate['700']}
      >
        Posted on {formatDate(info.createdAt)}
      </Block>

      <Block
        marginTop={10}
        lineHeight={1.5}
        fontSize={13}
        textOverflow="ellipsis"
        emptyDisplay="none"
      >
        {description}

        {shouldTruncateDescription && (
          <InlineBlock
            marginLeft={5}
            fontWeight={700}
            color={colors.blue['700']}
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
              <Block fontSize={24} fontWeight={700} color={colors.slate['900']}>
                {info.title}
              </Block>

              <Block
                component="a"
                marginTop={20}
                fontSize={15}
                textDecoration="underline"
                color={colors.blue['700']}
                cursor="pointer"
                props={{ href: info.url, target: '_blank' }}
              >
                {info.url}
              </Block>

              <Block
                marginTop={10}
                fontSize={15}
                lineHeight={1.25}
                color={colors.slate['700']}
              >
                Posted on {formatDate(info.createdAt)}
              </Block>

              <Block
                marginTop={20}
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
