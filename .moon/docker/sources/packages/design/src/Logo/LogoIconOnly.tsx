import React from 'react'

interface Props {
  size?: number
  variant?: 'primary' | 'secondary'
}

export const LogoIconOnly: React.FC<Props> = ({
  size = 48,
  variant = 'primary',
}) => (
  <svg
    height={size}
    viewBox="0 0 118 118"
    fill={variant === 'primary' ? '#1d4ed8' : 'white'}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M57.3104 34.9219C50.772 38.4356 46.2033 44.1577 44.0164 50.6869L28.8448 45.6053C32.2736 35.3683 39.4707 26.3448 49.7366 20.8281C71.1421 9.32503 97.8197 17.3526 109.323 38.7581C120.826 60.1636 112.798 86.8413 91.3927 98.3443C76.1832 106.518 58.3245 104.823 45.1468 95.5115L54.3797 82.4443C62.7946 88.39 74.157 89.4426 83.8189 84.2504C97.4406 76.9303 102.549 59.9536 95.2289 46.3319C87.9088 32.7103 70.9321 27.6018 57.3104 34.9219Z"
    />
    <path d="M15 32L63 53L23 72L15 32Z" />
  </svg>
)
