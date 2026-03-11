import { Loader as LoaderIcon } from 'lucide-react'
import React, { forwardRef } from 'react'
import { Center } from '../Center'
import { Spin } from '../FX/Spin'

/**
 * Full-page loading indicator that centers a spinning loader icon.
 *
 * Fills its parent container (`height: 100%`) so callers control the
 * overall dimensions. Use inside a sized wrapper such as a page body
 * or a layout region.
 *
 * @example
 *   <Block height="calc(100vh - 90px)">
 *     <FullPageLoading />
 *   </Block>
 */
export const FullPageLoading = forwardRef<HTMLDivElement>((_props, ref) => {
  return (
    <Center ref={ref}>
      <Spin>
        <LoaderIcon />
      </Spin>
    </Center>
  )
})

FullPageLoading.displayName = 'FullPageLoading'
