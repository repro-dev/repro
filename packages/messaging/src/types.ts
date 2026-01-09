import { FutureInstance } from 'fluture'

export interface Intent<P = any> {
  type: string
  payload?: P
}

export type Unsubscribe = () => void

export type Resolver<P = any, R = any> = (
  payload: P
) => FutureInstance<Error, R>

export interface Agent {
  name: string
  raiseIntent<R, P = any>(
    intent: Intent<P>,
    options?: any
  ): FutureInstance<Error, R>
  subscribeToIntent<P = any, R = any>(
    type: string,
    resolver: Resolver<P, R>
  ): Unsubscribe
  destroy(): void
}
