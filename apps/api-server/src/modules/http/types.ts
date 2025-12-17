import { FutureInstance } from 'fluture'
import { Dispatcher } from 'undici'

export interface HttpClient {
  request<T>(
    options: Dispatcher.RequestOptions<T>
  ): FutureInstance<Error, Dispatcher.ResponseData<T>>
}
