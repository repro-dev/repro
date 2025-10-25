import { CodecVersion, Migration } from './types'

export function createMigrate(migrations: Array<Migration>) {
  return function migrate(
    input: any,
    from: CodecVersion,
    to: CodecVersion
  ): void {
    if (from === to) {
      return
    }

    const direction = from < to ? 'up' : 'down'
    const lowerVersion = direction === 'up' ? from : to
    const upperVersion = direction === 'up' ? to : from

    let boundedMigrations: Array<Migration> = []

    for (const migration of migrations) {
      if (
        migration.version > lowerVersion &&
        migration.version <= upperVersion
      ) {
        boundedMigrations.push(migration)
      }
    }

    if (direction === 'down') {
      boundedMigrations.reverse()
    }

    for (const migration of boundedMigrations) {
      if (direction === 'up') {
        migration.up(input)
      } else {
        migration.down(input)
      }
    }
  }
}
