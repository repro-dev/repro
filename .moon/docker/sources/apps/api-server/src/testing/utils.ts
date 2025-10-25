import compress from '@fastify/compress'
import cors from '@fastify/cors'
import fastify, { FastifyInstance, FastifyPluginCallback } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import Future, { FutureInstance, resolve } from 'fluture'
import { Readable } from 'node:stream'

export function fromRouter(
  router: FastifyPluginCallback,
  decorators: Array<(fastify: FastifyInstance) => void> = []
): FastifyInstance {
  const app = fastify() as unknown as FastifyInstance

  app.addContentTypeParser('*', async () => {})

  app.register(cors)
  app.register(compress)

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  for (const decorator of decorators) {
    decorator(app)
  }

  return app.register(router)
}

export function readableToString(
  input: Readable
): FutureInstance<Error, string> {
  return Future((reject, resolve) => {
    const chunks: Array<string> = []

    input.on('data', onData)
    input.on('end', onEnd)
    input.on('error', onError)

    function onData(chunk: any) {
      chunks.push(chunk.toString())
    }

    function onEnd() {
      resolve(chunks.join(''))
    }

    function onError(error: Error) {
      reject(error)
    }

    return () => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.off('error', onError)
    }
  })
}

export function stringToReadable(
  input: string
): FutureInstance<Error, Readable> {
  return resolve(Readable.from([input]))
}
