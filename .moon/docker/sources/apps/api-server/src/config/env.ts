import { createEnv } from './createEnv'

export const defaultEnv = createEnv(process.env)

if (defaultEnv.DEBUG) {
  console.log('ENVIRONMENT:\n\n', JSON.stringify(defaultEnv, null, 2))
}
