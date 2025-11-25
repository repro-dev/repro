import { Snapshot } from '@repro/domain'
import { v4 as uuidv4 } from 'uuid'

export function createRecordingId() {
  return uuidv4()
}

export function createEmptySnapshot(): Snapshot {
  return {
    dom: null,
    interaction: null,
  }
}
