declare module "fluture" {
  export type FutureInstance<L, R> = {
    pipe: (...args: unknown[]) => unknown;
  };

  export const Future: any;
  export const fork: any;
}
