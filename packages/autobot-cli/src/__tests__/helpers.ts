import assert from "node:assert/strict";

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function assertNormalizedEqual(actual: string, expected: string): void {
  assert.equal(normalizeWhitespace(actual), normalizeWhitespace(expected));
}

export function collectCommandPaths(command: {
  commands?: ReadonlyArray<any>;
  name(): string;
}): string[] {
  const paths: string[] = [];

  const visit = (node: any, ancestry: string[]): void => {
    const currentPath = [...ancestry, node.name()];

    if (currentPath.length > 1) {
      paths.push(currentPath.slice(1).join(" "));
    }

    for (const child of node.commands ?? []) {
      visit(child, currentPath);
    }
  };

  visit(command, []);

  return paths;
}
