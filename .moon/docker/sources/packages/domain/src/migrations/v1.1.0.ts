import { SourceEventType } from '../generated/event'
import { Migration } from './types'

const migration: Migration = {
  version: '1.1.0',

  up(input: any) {
    if (input.type === SourceEventType.Snapshot) {
      if (input.data.interaction) {
        input.data.interaction.pageURL = ''
      }
    }
  },

  down(input: any) {
    if (input.type === SourceEventType.Snapshot) {
      if (input.data.interaction) {
        delete input.data.interaction.pageURL
      }
    }
  },
}

export default migration
