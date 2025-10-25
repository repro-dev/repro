import { createMigrate } from './createMigrate'
import { Migration } from './types'
import { default as migration_v1_1_0 } from './v1.1.0'

const migrations: Array<Migration> = [migration_v1_1_0]
export const migrate = createMigrate(migrations)
