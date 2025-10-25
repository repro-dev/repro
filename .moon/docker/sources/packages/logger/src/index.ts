const methodNames = ['log', 'info', 'warn', 'error', 'debug'] as const

export const logger = methodNames.reduce(
  (methods, name) => {
    methods[name] = console[name].bind(console)
    return methods
  },
  {} as Record<(typeof methodNames)[number], (...args: any[]) => void>
)
