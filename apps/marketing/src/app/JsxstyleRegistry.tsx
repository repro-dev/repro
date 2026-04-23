'use client'

import { cache } from '@jsxstyle/react'
import { useServerInsertedHTML } from 'next/navigation'
import React, { useState, type ReactNode } from 'react'

void React

interface JsxstyleRegistryProps {
  children: ReactNode
}

export function JsxstyleRegistry({ children }: JsxstyleRegistryProps) {
  const [rules] = useState(() => {
    const collectedRules: string[] = []

    cache.reset()
    cache.injectOptions({
      onInsertRule: rule => {
        collectedRules.push(rule)
      },
    })

    return collectedRules
  })

  useServerInsertedHTML(() => {
    const css = rules.join('')
    rules.length = 0

    if (!css) {
      return null
    }

    return <style dangerouslySetInnerHTML={{ __html: css }} />
  })

  return children
}
