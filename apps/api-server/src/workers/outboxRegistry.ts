import { createOutboxRegistry } from '~/services/outbox'

export const outboxRegistry = createOutboxRegistry({})

export type DefaultOutboxRegistry = typeof outboxRegistry
