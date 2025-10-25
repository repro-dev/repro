import { Kysely } from 'kysely'
import { Schema } from './schema'

export type Database = Kysely<Schema>
