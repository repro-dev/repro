import { SourceEvent, VTree } from '@repro/domain'
import { copyObjectDeep } from '@repro/std'

let enabled = false

interface Frame {
  elapsed: number
  snapshot: VTree | null
  events: Array<SourceEvent>
}

let lastFrame: Frame | null = null

export const Trace = {
  enable() {
    enabled = true
  },

  disable() {
    enabled = false
  },

  createFrame(factory: () => Frame) {
    if (enabled) {
      lastFrame = copyObjectDeep(factory())
    }
  },

  getLastFrame() {
    return lastFrame
  },
}
