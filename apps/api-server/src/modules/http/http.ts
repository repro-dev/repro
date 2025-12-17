import { attemptP, FutureInstance } from 'fluture'
import { Agent, Dispatcher } from 'undici'

const defaultDispatcher = new Agent()

export function createHttpClient(dispatcher: Dispatcher = defaultDispatcher) {
  function request<T = null>(
    options: Dispatcher.RequestOptions<T>
  ): FutureInstance<Error, Dispatcher.ResponseData<T>> {
    return attemptP(() => dispatcher.request(options))
  }

  return { request }
}
