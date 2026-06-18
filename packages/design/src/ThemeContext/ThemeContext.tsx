import React, { useEffect } from 'react'

export interface ThemeProviderProps {
  colorScheme?: 'light' | 'dark' | 'light dark'
  children?: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  colorScheme = 'light dark',
  children,
}) => {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('color-scheme', colorScheme)
    return () => {
      root.style.removeProperty('color-scheme')
    }
  }, [colorScheme])

  return <>{children}</>
}
