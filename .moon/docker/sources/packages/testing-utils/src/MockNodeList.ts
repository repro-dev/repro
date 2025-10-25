export class MockNodeList implements NodeList, Iterable<Node> {
  static from(values: Array<Node>) {
    return new MockNodeList(values)
  }

  static empty() {
    return new MockNodeList([])
  }

  [index: number]: Node

  constructor(private readonly values: Array<Node>) {
    for (const [key, value] of values.entries()) {
      this[key] = value
    }
  }

  *[Symbol.iterator](): Iterator<Node> {
    for (const item of this.values) {
      yield item
    }
  }

  get length() {
    return this.values.length
  }

  item(index: number) {
    return this.values[index] ?? null
  }

  forEach(
    callbackfn: (value: Node, key: number, parent: NodeListOf<Node>) => void,
    thisArg?: any
  ) {
    this.values.forEach((value, key) => {
      callbackfn(
        value,
        key,
        value.parentNode
          ? (MockNodeList.from([value.parentNode]) as NodeListOf<Node>)
          : (MockNodeList.empty() as NodeListOf<Node>)
      )
    }, thisArg)
  }
}
