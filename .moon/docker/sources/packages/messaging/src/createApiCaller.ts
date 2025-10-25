import { Agent } from './types'

export function createApiCaller(agent: Agent) {
  // TODO: figure out generic types
  return function call<T>(
    namespace: string,
    method: string,
    args: Array<any> = []
  ) {
    return agent.raiseIntent<T>({
      type: 'api:call',
      payload: {
        namespace,
        method,
        args,
      },
    })
  }
}
