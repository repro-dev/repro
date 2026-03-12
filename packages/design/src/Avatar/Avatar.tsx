import { Block, Row } from '@jsxstyle/react'
import md5 from 'md5'
import React, { useEffect, useMemo, useState } from 'react'
import { color as colorToken } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontWeight } from '../tokens/typography'

const palette = [
  colorToken.info,
  colorToken.success,
  colorToken.warning,
  colorToken.danger,
  colorToken.neutral,
  colorToken.primary,
]

function getInitials(name: string | undefined): string {
  if (!name || name.trim().length === 0) return '?'
  const words = name.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
}

function getBackgroundColor(name: string | undefined): string {
  const str = name ?? ''
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash += str.charCodeAt(i)
  }
  return palette[hash % palette.length] as string
}

interface Props {
  email?: string
  name?: string
  mode?: 'full' | 'image-only' | 'text-only'
  size?: number
  color?: string
}

export const Avatar: React.FC<Props> = ({
  email,
  name = email,
  mode = 'full',
  size = 30,
  color = 'inherit',
}) => {
  const [hasError, setHasError] = useState(false)

  const hash = useMemo(() => {
    return email != null ? md5(email.trim()) : null
  }, [email])

  useEffect(() => {
    setHasError(false)
  }, [email])

  const showImage = mode === 'full' || mode === 'image-only'
  const showText = mode === 'full' || mode === 'text-only'

  const showInitials = showImage && (hash === null || hasError)

  return (
    <Row alignItems="center" gap={spacing.md}>
      {showImage && !showInitials && hash !== null && (
        <Block
          overflow="hidden"
          borderRadius="99rem"
          width={size}
          height={size}
        >
          <img
            src={`https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`}
            alt={name}
            onError={() => setHasError(true)}
          />
        </Block>
      )}

      {showInitials && (
        <Block
          overflow="hidden"
          borderRadius="99rem"
          width={size}
          height={size}
          backgroundColor={getBackgroundColor(name)}
          display="flex"
          alignItems="center"
          justifyContent="center"
          color={colorToken.text.inverse}
          fontSize={size * 0.4}
          fontWeight={fontWeight.semibold}
          lineHeight={1}
        >
          {getInitials(name)}
        </Block>
      )}

      {showText && (
        <Block fontSize={size / 2} color={color}>
          {name}
        </Block>
      )}
    </Row>
  )
}
