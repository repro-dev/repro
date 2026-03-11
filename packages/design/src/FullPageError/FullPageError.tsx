import { AlertTriangle as AlertIcon } from 'lucide-react'
import React, { forwardRef } from 'react'
import { Alert } from '../Alert'
import { Center } from '../Center'

export interface FullPageErrorProps {
  title: string
  description: string
}

/**
 * Full-page error state that centers an alert banner with an icon,
 * title, and description.
 *
 * Fills its parent container (`height: 100%`) so callers control the
 * overall dimensions. Use inside a sized wrapper such as a page body
 * or a layout region.
 *
 * @example
 *   <Block height="calc(100vh - 90px)">
 *     <FullPageError
 *       title="Something went wrong"
 *       description="There was an error loading this recording."
 *     />
 *   </Block>
 */
export const FullPageError = forwardRef<HTMLDivElement, FullPageErrorProps>(
  ({ title, description }, ref) => {
    return (
      <Center ref={ref}>
        <Alert type="danger" icon={<AlertIcon size={16} />}>
          <strong>{title}</strong> {description}
        </Alert>
      </Center>
    )
  }
)

FullPageError.displayName = 'FullPageError'
