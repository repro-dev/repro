import { Block } from '@jsxstyle/react'
import { JSONView } from '@repro/design'
import React, { PropsWithChildren } from 'react'

interface Props {
  body: ArrayBuffer
  contentType: string | null
}

const textDecoder = new TextDecoder()

function decode(buf: ArrayBuffer) {
  return textDecoder.decode(buf)
}

function isBinary(contentType: string) {
  return contentType.startsWith('application/octet-stream')
}

function isJSON(contentType: string) {
  return contentType.startsWith('application/json')
}

export const Body: React.FC<Props> = ({ body, contentType }) => {
  contentType = contentType || 'text/plain'

  if (isBinary(contentType)) {
    // TODO: output hex binary string
    return null
  }

  if (isJSON(contentType)) {
    try {
      const data = JSON.parse(decode(body))
      return (
        <Container>
          <JSONView data={data} />
        </Container>
      )
    } catch {}
  }

  return <Container>{decode(body)}</Container>
}

const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Block padding={10} fontSize={13} lineHeight={1.25} wordBreak="break-all">
    {children}
  </Block>
)
