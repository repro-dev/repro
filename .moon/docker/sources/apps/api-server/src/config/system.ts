import { defaultEnv as env } from '~/config/env'

export interface SystemConfig {
  debug: boolean
}

export const defaultSystemConfig: SystemConfig = {
  debug: !!env.DEBUG,
}
