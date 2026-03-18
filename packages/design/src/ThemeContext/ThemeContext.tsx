import React, { createContext, useContext } from 'react'
import { color, type ColorToken } from '../tokens/colors'

type Widen<T> = T extends string ? string : T extends number ? number : T

type WidenLeaves<T> = {
  [K in keyof T]: T[K] extends object ? WidenLeaves<T[K]> : Widen<T[K]>
}

export interface ThemeConfig {
  color: ColorToken
}

export type ThemeDefinition = WidenLeaves<ThemeConfig>

export const defaultTheme: ThemeConfig = {
  color,
}

const ThemeContext = createContext<ThemeConfig>(defaultTheme)

export interface ThemeProviderProps {
  theme: ThemeDefinition
  children?: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  theme,
  children,
}) => {
  return (
    <ThemeContext.Provider value={theme as ThemeConfig}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeConfig {
  return useContext(ThemeContext)
}
