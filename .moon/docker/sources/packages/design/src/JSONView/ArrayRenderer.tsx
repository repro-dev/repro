import { Block } from '@jsxstyle/react'
import React, { Fragment, useState } from 'react'
import { getRendererForType } from './getRendererForType'
import { Toggle } from './Toggle'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
  value: Array<any>
}

export const ArrayRenderer: React.FC<Props> = ({ level, objectKey, value }) => {
  const [open, setOpen] = useState(false)

  return (
    <Fragment>
      <TreeRow level={level} objectKey={objectKey}>
        <Block position="absolute" top={8.125} left={-15}>
          <Toggle isOpen={open} onClick={() => setOpen(open => !open)} />
        </Block>

        <Block>Array({value.length})</Block>
      </TreeRow>

      {open &&
        value.map((item, i) =>
          getRendererForType(i.toString(), item, level + 1)
        )}
    </Fragment>
  )
}
