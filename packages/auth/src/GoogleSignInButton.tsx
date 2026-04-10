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
      // 44px matches the design system large formControlHeight, keeping the
      // Google button visually consistent with the submit button above it.
      // Google's spec permits heights of 36px, 40px, or 48px; 44px falls
      // within that range and is closest to the DS large tier.
      height: '44px',
      padding: 0,
      background: '#FFFFFF',
      border: '1px solid #747775',
      borderRadius: '4px',
      cursor: 'pointer',
      fontFamily: "'Roboto', sans-serif",
      // 13px matches DS fontSize.sm (large button tier) — the closest token
      // to Google's preferred 14px while staying on the design system scale.
      fontSize: '13px',
      fontWeight: 500,
      color: '#1F1F1F',
      lineHeight: '20px',
      gap: 0,
    }}
  >
    {/* Logo container: 44×44 with 12px left padding per Google web spec */}
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '44px',
        height: '44px',
        flexShrink: 0,
      }}
    >
      <GoogleGLogo />
    </span>
    {/* 12px right padding balances the logo container's implicit left padding */}
    <span style={{ paddingRight: '12px' }}>Continue with Google</span>
  </button>
)
