import React from 'react'

export interface ThemeProviderProps {
  /**
   * Color scheme for this subtree. Defaults to `light`: dark mode is opt-in
   * until the dark theme has had a design review (REP-1453), so production
   * surfaces stay light. Pass `dark` or `light dark` explicitly (e.g. in
   * Storybook) to exercise the dark `light-dark()` token variants.
   */
  colorScheme?: 'light' | 'dark' | 'light dark'
  children?: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  colorScheme = 'light',
  children,
}) => {
  // `display: contents` keeps the wrapper layout-transparent while still
  // propagating `color-scheme` to descendants, so `light-dark()` tokens resolve
  // per-subtree. Scoping it on this element (rather than document.documentElement)
  // lets nested/side-by-side providers each control their own scheme and works
  // even when an ancestor — e.g. the @repro/theme reset stylesheet — has pinned
  // the root element's color-scheme.
  return <div style={{ display: 'contents', colorScheme }}>{children}</div>
}
