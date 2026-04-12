import Redis from 'ioredis'

export type { Redis as RedisClient }

interface Config {
  url: string
}

export function createRedisClient(config: Config): Redis {
  return new Redis(config.url)
}
