import { Block, Row } from '@jsxstyle/react'
import md5 from 'md5'
import React, { useMemo } from 'react'
import { spacing } from '../tokens/spacing'

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
  const hash = useMemo(() => {
    const key = email?.trim() ?? name?.trim()
    return key != null ? md5(key) : null
  }, [email, name])

  const showImage = mode === 'full' || mode === 'image-only'
  const showText = mode === 'full' || mode === 'text-only'

  return (
    <Row alignItems="center" gap={spacing.md}>
      {showImage && hash !== null && (
        <Block
          overflow="hidden"
          borderRadius="99rem"
          width={size}
          height={size}
        >
          <img
            src={`https://www.gravatar.com/avatar/${hash}?s=${size}&d=initials`}
            alt={name}
          />
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
