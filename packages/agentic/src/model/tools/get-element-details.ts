import { NodeType, SyntheticId, VElement, VTree } from "@repro/domain";
import { resolve } from "fluture";
import { estimateTokens } from "../token-optimization";
import { createError } from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getElementDetails",
    description:
      "Get detailed information about a specific DOM element by its node ID. Use this to inspect attributes, styles, classes, parent context, and siblings of an element identified from getDOMState output. Only works when the recording contains DOM snapshots — call getDOMState() first to confirm DOM data is available before using this tool.",
    parameters: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "The node ID to inspect (from [ref=<nodeId>] in getDOMState output).",
        },
        timestampMs: {
          type: "number",
          description:
            "Point in time (ms from recording start) to reconstruct DOM state for.",
        },
        context: {
          type: "string",
          enum: ["self", "subtree", "ancestry"],
          default: "self",
          description:
            'Level of context: "self" (element + 3 ancestors + adjacent siblings), "subtree" (adds children to configurable depth), "ancestry" (full parent chain to root).',
        },
        depth: {
          type: "number",
          default: 3,
          description:
            'Maximum depth of children traversal when context is "subtree". Default is 3.',
        },
      },
      required: ["nodeId", "timestampMs"],
    },
  },
};

function getVNodeById(vtree: VTree, nodeId: SyntheticId): VElement | null {
  const node = vtree.nodes[nodeId];
  if (!node) return null;
  if (!node.match((n) => n.type === NodeType.Element)) return null;
  let result: VElement | null = null;
  node.apply((n) => {
    if (n.type === NodeType.Element) {
      result = n;
    }
  });
  return result;
}

function getParentChain(
  vtree: VTree,
  startId: SyntheticId | null | undefined,
  maxDepth: number,
): Array<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
}> {
  const parents: Array<{
    nodeId: string;
    tagName: string;
    attributes: Record<string, string>;
  }> = [];
  let currentId = startId;
  let depth = 0;
  while (currentId && depth < maxDepth) {
    const node = vtree.nodes[currentId];
    if (!node) break;
    let pushed = false;
    node.apply((n) => {
      if (n.type === NodeType.Element) {
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(n.attributes)) {
          if (v != null) attrs[k] = v;
        }
        parents.push({ nodeId: n.id, tagName: n.tagName, attributes: attrs });
        pushed = true;
      }
    });
    if (!pushed) break;
    node.apply((n) => {
      currentId = n.parentId ?? null;
    });
    depth++;
  }
  return parents;
}

function getAdjacentSiblings(
  vtree: VTree,
  parentId: SyntheticId | null | undefined,
  nodeId: SyntheticId,
): Array<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
}> {
  if (!parentId) return [];
  const parentNode = vtree.nodes[parentId];
  if (!parentNode) return [];
  const siblings: Array<{
    nodeId: string;
    tagName: string;
    attributes: Record<string, string>;
  }> = [];
  parentNode.apply((p) => {
    if (!("children" in p)) return;
    const idx = p.children.indexOf(nodeId);
    if (idx === -1) return;
    const adjacentIds: SyntheticId[] = [];
    if (idx > 0 && p.children[idx - 1]) adjacentIds.push(p.children[idx - 1]!);
    if (idx < p.children.length - 1 && p.children[idx + 1])
      adjacentIds.push(p.children[idx + 1]!);
    for (const sibId of adjacentIds) {
      const sibNode = vtree.nodes[sibId];
      if (!sibNode) continue;
      sibNode.apply((s) => {
        if (s.type === NodeType.Element) {
          const attrs: Record<string, string> = {};
          const limitedKeys = ["class", "id", "style"];
          for (const key of limitedKeys) {
            if (s.attributes[key] != null) attrs[key] = s.attributes[key]!;
          }
          siblings.push({
            nodeId: s.id,
            tagName: s.tagName,
            attributes: attrs,
          });
        }
      });
    }
  });
  return siblings;
}

interface SubtreeChildNode {
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  children?: SubtreeChildNode[];
}

// Recursively builds subtree children up to maxDepth levels.
// currentDepth starts at 1 (immediate children = depth 1).
// Returns empty array when maxDepth <= 0 or currentDepth > maxDepth.
function getSubtreeChildren(
  vtree: VTree,
  childIds: SyntheticId[],
  currentDepth: number,
  maxDepth: number,
): SubtreeChildNode[] {
  if (maxDepth <= 0 || currentDepth > maxDepth) return [];
  const children: SubtreeChildNode[] = [];
  for (const childId of childIds) {
    const childNode = vtree.nodes[childId];
    if (!childNode) continue;
    childNode.apply((c) => {
      if (c.type === NodeType.Element) {
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(c.attributes)) {
          if (v != null) attrs[k] = v;
        }
        // Collect text content from direct VText children only
        let textContent: string | undefined;
        for (const grandChildId of c.children) {
          const grandChild = vtree.nodes[grandChildId];
          if (!grandChild) continue;
          grandChild.apply((gc) => {
            if (gc.type === NodeType.Text) {
              textContent = (textContent ?? "") + gc.value;
            }
          });
        }

        const node: SubtreeChildNode = {
          nodeId: c.id,
          tagName: c.tagName,
          attributes: attrs,
          ...(textContent != null ? { textContent } : {}),
        };

        // Recurse if we haven't hit maxDepth yet
        if (currentDepth < maxDepth) {
          node.children = getSubtreeChildren(
            vtree,
            c.children,
            currentDepth + 1,
            maxDepth,
          );
        }

        children.push(node);
      }
    });
  }
  return children;
}

function collectTextContent(
  vtree: VTree,
  childIds: SyntheticId[],
  maxLength: number,
): string {
  let text = "";
  for (const childId of childIds) {
    if (text.length >= maxLength) break;
    const childNode = vtree.nodes[childId];
    if (!childNode) continue;
    childNode.apply((c) => {
      if (c.type === NodeType.Text) {
        text += c.value;
      } else if (c.type === NodeType.Element && "children" in c) {
        text += collectTextContent(vtree, c.children, maxLength - text.length);
      }
    });
  }
  return text.slice(0, maxLength);
}

export const handler: ToolHandler = (recording, args) => {
  const nodeId = args.nodeId as string | undefined;
  const timestampMs = args.timestampMs as number | undefined;
  const context = (args.context as string) ?? "self";
  const depth = (args.depth as number) ?? 3;

  if (!nodeId) {
    return resolve(
      createError(
        "nodeId parameter is required",
        "The nodeId parameter was not provided",
        "Call getDOMState() to get a DOM snapshot, then use the nodeId values from the [ref=<nodeId>] attributes in the output",
      ),
    );
  }
  if (timestampMs === undefined) {
    return resolve(
      createError(
        "timestampMs parameter is required",
        "The timestampMs parameter was not provided",
        "Call getRecordingDuration() to get the valid recording time range, then provide a timestamp within that range",
      ),
    );
  }

  const snapshot = recording.getSnapshotAtTime(timestampMs);
  if (!snapshot || !snapshot.dom) {
    return resolve(
      createError(
        "No DOM snapshot available at the specified time",
        "The timestamp may be outside the recording range or no DOM snapshot was captured at this point",
        "Call getRecordingDuration() to get the valid recording time range, then retry with a timestamp within that range",
      ),
    );
  }

  const vtree = snapshot.dom;
  const element = getVNodeById(vtree, nodeId as SyntheticId);
  if (!element) {
    return resolve(
      createError(
        `Element with nodeId "${nodeId}" not found`,
        "The nodeId may be stale or from a different timestamp",
        "Call getDOMState() at the same timestamp to get fresh nodeId values from the current DOM snapshot",
      ),
    );
  }

  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(element.attributes)) {
    if (v != null) attrs[k] = v;
  }

  const properties: Record<string, unknown> = {};
  if (element.properties.value != null)
    properties.value = element.properties.value;
  if (element.properties.checked != null)
    properties.checked = element.properties.checked;
  if (element.properties.selectedIndex != null)
    properties.selectedIndex = element.properties.selectedIndex;

  const maxParents = context === "ancestry" ? 50 : 3;
  const parents = getParentChain(vtree, element.parentId, maxParents);
  const siblings = getAdjacentSiblings(
    vtree,
    element.parentId,
    nodeId as SyntheticId,
  );

  const result: Record<string, unknown> = {
    element: {
      nodeId: element.id,
      tagName: element.tagName,
      attributes: attrs,
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
    },
    parents,
    siblings,
  };

  if (context === "subtree") {
    result.children = getSubtreeChildren(vtree, element.children, 1, depth);
    const textContent = collectTextContent(vtree, element.children, 200);
    if (textContent.length > 0) {
      result.textContent = textContent;
    }
    return resolve({ ...result, _tokenEstimate: estimateTokens(result) });
  }

  const textContent = collectTextContent(vtree, element.children, 200);
  if (textContent.length > 0) {
    result.textContent = textContent;
  }

  return resolve(result);
};
