import { Lens, View } from './view'

type InputOf<V extends View<any, any>> = Parameters<V['encode']>[0]
type OutputOf<V extends View<any, any>> = ReturnType<V['decode']>

export class List<V extends View<any, any>> implements Iterable<OutputOf<V>> {
  private readonly source: Array<DataView> = []

  constructor(private view: V, items: Array<InputOf<V>> | Array<DataView>) {
    const source: Array<DataView> = []

    for (const item of items) {
      if (ArrayBuffer.isView(item)) {
        source.push(item)
      } else {
        source.push(this.view.encode(item))
      }
    }

    this.source = source
  }

  public size(): number {
    return this.source.length
  }

  public at(index: number) {
    return this.source[index] ?? null
  }

  public delete(index: number) {
    this.source.splice(index, 1)
  }

  public over(index: number): (OutputOf<V> & Lens) | null {
    const item = this.at(index)
    return item ? this.view.over(item) : null
  }

  public decode(index: number): OutputOf<V> | null {
    const item = this.at(index)
    return item ? this.view.decode(item) : null
  }

  public slice(start?: number, end?: number) {
    return new List<V>(this.view, this.source.slice(start, end))
  }

  public prepend(...items: Array<InputOf<V>>) {
    return this.source.unshift(...items.map(item => this.view.encode(item)))
  }

  public append(...items: Array<InputOf<V>>) {
    return this.source.push(...items.map(item => this.view.encode(item)))
  }

  public toSource() {
    return this.source
  }

  public toArray() {
    return Array.from(this)
  }

  *[Symbol.iterator]() {
    for (const item of this.source) {
      yield this.view.decode(item)
    }
  }
}
