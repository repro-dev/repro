import React from 'react'

export interface ThemeProviderProps {
  colorScheme?: 'light' | 'dark'
  children?: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  colorScheme = 'light',
  children,
}) => {
  return (
    <>
      <style>{`:root { color-scheme: ${colorScheme}; }`}</style>
      {children}
    </>
  )
}
