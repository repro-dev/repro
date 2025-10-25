import { Block, Grid, Row } from '@jsxstyle/react'
import { colors, DefinitionList } from '@repro/design'
import { getReasonPhrase } from 'http-status-codes'
import React from 'react'
import { FetchGroup } from '../types'

interface Props {
  group: FetchGroup
}

function sortedHeaders(headers: Record<string, string>) {
  return Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : 1))
}

function getStatusValue(status: number | undefined) {
  if (status === undefined) {
    return '(pending)'
  }

  let indicatorColor: string

  if (status < 200) {
    indicatorColor = colors.slate['500']
  } else if (status < 300) {
    indicatorColor = colors.emerald['500']
  } else if (status < 400) {
    indicatorColor = colors.amber['500']
  } else {
    indicatorColor = colors.rose['500']
  }

  const statusIndicator = (
    <Block
      width={10}
      height={10}
      borderRadius="99rem"
      backgroundColor={indicatorColor}
    />
  )

  try {
    return (
      <Row alignItems="center" gap={5}>
        {statusIndicator}
        <Block>{status}</Block>
        <Block>{getReasonPhrase(status)}</Block>
      </Row>
    )
  } catch {
    return status
  }
}

export const Headers: React.FC<Props> = ({ group }) => {
  const generalHeaders = [
    ['URL', group.request.url],
    ['Status', getStatusValue(group.response?.status)],
  ] satisfies Array<[string, React.ReactNode]>

  const requestHeaders = sortedHeaders(group.request.headers)

  const responseHeaders = group.response
    ? sortedHeaders(group.response.headers)
    : null

  return (
    <Grid
      gridTemplateColumns="max-content 1fr"
      fontSize={13}
      overflowX="hidden"
    >
      <DefinitionList title="General" pairs={generalHeaders} />

      <DefinitionList title="Request" pairs={requestHeaders} />

      {responseHeaders && (
        <DefinitionList title="Response" pairs={responseHeaders} />
      )}
    </Grid>
  )
}
