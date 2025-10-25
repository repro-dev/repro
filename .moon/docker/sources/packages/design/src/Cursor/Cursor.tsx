import React from 'react'
import { colors } from '../theme'

interface Props {
  color?: string
  size?: number
}

export const Cursor: React.FC<Props> = ({ color, size = 24 }) => (
  <svg
    xmlns="http://www.w3,org/2000/svg"
    viewBox="0 0 12 20"
    width={size}
    height={size}
  >
    <path
      d="M0.199997 16.9V0.900024L11.8 12.5H5L4.6 12.6L0.199997 16.9Z"
      fill={colors.white}
    />
    <path d="M9.3 17.6L5.7 19.1L1 8L4.7 6.5L9.3 17.6Z" fill={colors.white} />
    <path
      d="M4.8745 9.51852L3.0303 10.2927L6.1271 17.6695L7.9713 16.8953L4.8745 9.51852Z"
      fill={color}
    />
    <path
      d="M1.2 3.29999V14.5L4.2 11.6L4.6 11.5H9.4L1.2 3.29999Z"
      fill={color}
    />
  </svg>
)
