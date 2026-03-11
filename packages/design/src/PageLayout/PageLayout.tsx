import { Block } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { BrandedBackdrop } from './BrandedBackdrop'

export interface PageLayoutProps {
  branded?: boolean
  children?: React.ReactNode
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  branded,
  children,
}) => {
  return (
    <Block
      position="relative"
      minHeight="100vh"
      backgroundColor={color.bg.surface}
    >
      {branded && <BrandedBackdrop />}
      {children}
    </Block>
  )
}
