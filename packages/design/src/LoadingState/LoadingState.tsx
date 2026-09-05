import { Loader as LoaderIcon } from 'lucide-react'
import React, { forwardRef } from 'react'
// Import from source file (not the Object.assign index) to preserve the
// forwardRef<HTMLDivElement, EmptyStateProps> generic through the ref chain.
import { EmptyState as EmptyStateRoot } from '../EmptyState/EmptyState'
import { Spin } from '../FX/Spin'

/**
 * Section-level loading indicator that centers a spinning loader icon
 * using the EmptyState layout.
 *
 * Distinct from `FullPageLoading` (which fills the parent with `Center`).
 * Use `LoadingState` when loading content within a section or widget;
 * use `FullPageLoading` when loading the entire page.
 *
 * Usage:
 *
 * ```tsx
 * <Block height={300}>
 *   <LoadingState />
 * </Block>
 * ```
 */
export const LoadingState = forwardRef<HTMLDivElement, Record<string, never>>(
  (_props, ref) => {
    return (
      <EmptyStateRoot ref={ref}>
        <Spin>
          <LoaderIcon />
        </Spin>
      </EmptyStateRoot>
    )
  }
)

LoadingState.displayName = 'LoadingState'
