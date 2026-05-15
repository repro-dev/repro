const { Future: FutureImpl, fork: forkImpl } = require("fluture") as {
  Future: unknown;
  fork: unknown;
};

export type FutureInstance<E, T> = {
  pipe: (operator: (future: FutureInstance<E, T>) => any) => any;
  fork: (reject: (error: E) => void, resolve: (value: T) => void) => () => void;
};

export const Future = FutureImpl as any;
export const fork = forkImpl as any;
