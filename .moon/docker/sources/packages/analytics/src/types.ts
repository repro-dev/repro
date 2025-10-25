import { SyntheticId } from '@repro/domain'

export interface TrackedEvent {
  eventId: SyntheticId
  name: string
  time: number
  props: Record<string, string>
}
