import { Block, Grid, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { FetchGroup, WebSocketGroup } from '@repro/source-utils'
import { X as CloseIcon } from 'lucide-react'
import React, { Fragment, useState } from 'react'
import { Body } from './Body'
import { Headers } from './Headers'
import { Messages } from './Messages'
import { Tab } from './Tab'

interface Props {
  group: FetchGroup | WebSocketGroup
  onClose(): void
}

type View = 'headers' | 'request' | 'response' | 'messages'

function extractContentType(headers: Record<string, string>) {
  const header =
    Object.entries(headers).find(([key]) => {
      return key.toLowerCase() === 'content-type'
    }) || null

  return header ? header[1] : null
}

export const DetailsOverlay: React.FC<Props> = ({ group, onClose }) => {
  const [view, setView] = useState<View>(
    group.type === 'ws' ? 'messages' : 'headers'
  )

  const requestBody =
    group.type === 'fetch' && group.request.body.byteLength
      ? group.request.body
      : null

  const requestContentType =
    group.type === 'fetch' ? extractContentType(group.request.headers) : null

  const responseBody =
    group.type === 'fetch' && group.response?.body.byteLength
      ? group.response?.body ?? null
      : null

  const responseContentType =
    group.type === 'fetch'
      ? extractContentType(group.response?.headers ?? {})
      : null

  return (
    <Grid
      gridTemplateRows="auto 1fr"
      position="absolute"
      width="75%"
      top={0}
      bottom={0}
      right={0}
      backgroundColor={colors.white}
      borderLeft={`1px solid ${colors.slate['200']}`}
      boxShadow={`
        0 4px 16px rgba(0, 0, 0, 0.1),
        0 1px 2px rgba(0, 0, 0, 0.1)
      `}
    >
      <Row
        gap={10}
        alignItems="center"
        padding={10}
        backgroundColor={colors.slate['50']}
        borderBottom={`1px solid ${colors.slate['200']}`}
      >
        <Row
          alignItems="center"
          justifyContent="center"
          width={24}
          height={24}
          borderRadius="99rem"
          backgroundColor="transparent"
          hoverBackgroundColor={colors.slate['200']}
          cursor="pointer"
          props={{ onClick: onClose }}
        >
          <CloseIcon size={14} />
        </Row>

        {group.type === 'fetch' && (
          <Fragment>
            <Tab
              active={view === 'headers'}
              label="Headers"
              onClick={() => setView('headers')}
            />

            {requestBody && (
              <Tab
                active={view === 'request'}
                label="Request"
                onClick={() => setView('request')}
              />
            )}

            {responseBody && (
              <Tab
                active={view === 'response'}
                label="Response"
                onClick={() => setView('response')}
              />
            )}
          </Fragment>
        )}

        {group.type === 'ws' && (
          <Tab
            active={view === 'messages'}
            label="Messages"
            onClick={() => setView('messages')}
          />
        )}
      </Row>

      <Block overflow="auto" padding={10}>
        {group.type === 'fetch' && (
          <Fragment>
            {view === 'headers' && <Headers group={group} />}
            {view === 'request' && requestBody && (
              <Body body={requestBody} contentType={requestContentType} />
            )}
            {view === 'response' && responseBody && (
              <Body body={responseBody} contentType={responseContentType} />
            )}
          </Fragment>
        )}

        {group.type === 'ws' && (
          <Fragment>
            {view === 'messages' && <Messages group={group} />}
          </Fragment>
        )}
      </Block>
    </Grid>
  )
}
