import React, { createContext, useContext, useMemo } from 'react'
import { colors } from '../tokens/colors'

export interface BrandGradient {
  from: string
  to: string
}

export interface BrandConfig {
  gradient: BrandGradient
}

export interface ThemeConfig {
  brand: BrandConfig
}

const defaultTheme: ThemeConfig = {
  brand: {
    gradient: {
      from: colors.blue['900'],
      to: colors.blue['700'],
    },
  },
}

const ThemeContext = createContext<ThemeConfig>(defaultTheme)

export interface ThemeProviderProps {
  brand?: Partial<BrandConfig>
  children?: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  brand,
  children,
}) => {
  const value = useMemo<ThemeConfig>(
    () => ({
      brand: {
        gradient: brand?.gradient ?? defaultTheme.brand.gradient,
      },
    }),
    [brand?.gradient]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeConfig {
  return useContext(ThemeContext)
}
