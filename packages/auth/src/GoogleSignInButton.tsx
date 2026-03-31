import React from 'react'
import { GoogleGLogo } from './assets/GoogleGLogo'

interface Props {
  onClick(): void
}

// Implements Google's official branding guidelines for the "Continue with Google" button.
// Inline styles are intentional here — this is an externally-mandated spec with exact
// pixel values (colors, spacing, typography) that must not be overridden by the design system.
export const GoogleSignInButton: React.FC<Props> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '40px',
      padding: 0,
      background: '#FFFFFF',
      border: '1px solid #747775',
      borderRadius: '4px',
      cursor: 'pointer',
      fontFamily: "'Roboto', sans-serif",
      fontSize: '14px',
      fontWeight: 500,
      color: '#1F1F1F',
      lineHeight: '20px',
      gap: 0,
    }}
  >
    {/* Logo container: 40×40 with 12px left padding per Google web spec */}
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        flexShrink: 0,
      }}
    >
      <GoogleGLogo />
    </span>
    {/* 12px right padding balances the logo container's implicit left padding */}
    <span style={{ paddingRight: '12px' }}>Continue with Google</span>
  </button>
)
