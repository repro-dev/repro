import { CodecVersion } from './migrations/types'

// Importing file from outside TypeScript root directory
// @ts-ignore
import pkg from '../package.json'

// Recording codec types
export const CODEC_VERSION = pkg.version as CodecVersion
export * from './generated/common'
export * from './generated/console'
export * from './generated/event'
export * from './generated/interaction'
export * from './generated/network'
export * from './generated/performance'
export * from './generated/point'
export * from './generated/recording'
export * from './generated/snapshot'
export * from './generated/vdom'
export { migrate } from './migrations'
export type { CodecVersion }

// Interface types
export * from './account'
export * from './project'
