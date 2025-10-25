import { VTree } from '@repro/domain'
import React from 'react'
import { VTreeContext } from './context'
import { NodeRenderer } from './NodeRenderer'

interface Props {
  vtree: VTree
}

export const TreeRenderer: React.FC<Props> = ({ vtree }) => (
  <VTreeContext.Provider value={vtree}>
    <NodeRenderer nodeId={vtree.rootId} depth={0} />
  </VTreeContext.Provider>
)
