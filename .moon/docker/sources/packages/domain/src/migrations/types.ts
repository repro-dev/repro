export type CodecVersion = `${number}.${number}.${number}`

export interface Migration {
  version: CodecVersion
  up(data: any): void
  down(data: any): void
}
