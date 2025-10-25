import { Block } from '@jsxstyle/react'
import React, { Fragment, useState } from 'react'
import { getRendererForType } from './getRendererForType'
import { Toggle } from './Toggle'
import { TreeRow } from './TreeRow'

interface Props {
  level: number
  objectKey: string | null
  value: object
}

export const ObjectRenderer: React.FC<Props> = ({
  level,
  objectKey,
  value,
}) => {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(value)

  return (
    <Fragment>
      <TreeRow level={level} objectKey={objectKey}>
        <Block position="absolute" top={8.125} left={-15}>
          <Toggle isOpen={open} onClick={() => setOpen(open => !open)} />
        </Block>

        <Block>{'{...}'}</Block>
      </TreeRow>

      {open &&
        entries.map(([key, value]) => (
          <Fragment key={key}>
            {getRendererForType(key, value, level + 1)}
          </Fragment>
        ))}
    </Fragment>
  )
}
