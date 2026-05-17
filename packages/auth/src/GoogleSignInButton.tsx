import { Button } from '@repro/design'
import React from 'react'
import { GoogleGLogo } from './assets/GoogleGLogo'

interface Props {
  onClick(): void
  size?: 'medium' | 'large'
}

export const GoogleSignInButton: React.FC<Props> = ({
  onClick,
  size = 'medium',
}) => (
  <Button
    fullWidth={true}
    size={size}
    variant="outlined"
    context="neutral"
    onClick={onClick}
  >
    <GoogleGLogo />
    <span>Continue with Google</span>
  </Button>
)
