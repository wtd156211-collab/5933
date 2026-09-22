import type { Workflow, WorkflowNode } from './types';

export interface PositionedNode extends WorkflowNode {
  x: number;
  y: number;
  depth: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: Array<{ id: string; from: PositionedNode; to: PositionedNode }>;
  width: number;
  height: number;
}

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 56;
const COLUMN_GAP = 64;
const ROW_GAP = 28;

/**
 * Layered (Sugiyama-style, simplified) layout: each node is placed in the
 * column equal to its longest dependency chain length, then columns are
 * centered vertically. Edge routing uses the node border anchors.
 */
export function layoutGraph(workflow: Workflow): GraphLayout {
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const depths = new Map<string, number>();

  const depthOf = (id: string, visiting: Set<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id);
    let depth = 0;
    if (node && node.dependsOn.length > 0) {
      depth =
        1 +
        Math.max(
          ...node.dependsOn
            .filter((dep) => byId.has(dep))
            .map((dep) => depthOf(dep, visiting)),
        );
    }
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };

  const columns = new Map<number, WorkflowNode[]>();
  for (const node of workflow.nodes) {
    const depth = depthOf(node.id, new Set());
    if (!columns.has(depth)) columns.set(depth, []);
    columns.get(depth)!.push(node);
  }

  const positions = new Map<string, PositionedNode>();
  const columnCount = Math.max(...columns.keys(), 0) + 1;
  let maxRows = 0;

  for (let col = 0; col < columnCount; col += 1) {
    const nodes = columns.get(col) ?? [];
    maxRows = Math.max(maxRows, nodes.length);
    const columnHeight =
      nodes.length * NODE_HEIGHT + (nodes.length - 1) * ROW_GAP;
    nodes.forEach((node, row) => {
      positions.set(node.id, {
        ...node,
        x: col * (NODE_WIDTH + COLUMN_GAP),
        y: row * (NODE_HEIGHT + ROW_GAP) - columnHeight / 2 + NODE_HEIGHT / 2,
        depth: col,
      });
    });
  }

  const width = columnCount * NODE_WIDTH + (columnCount - 1) * COLUMN_GAP;
  const height = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP + 24;

  const edges: GraphLayout['edges'] = [];
  for (const node of workflow.nodes) {
    for (const dep of node.dependsOn) {
      const from = positions.get(dep);
      const to = positions.get(node.id);
      if (from && to) edges.push({ id: `${dep}->${node.id}`, from, to });
    }
  }

  return {
    nodes: workflow.nodes.map((n) => positions.get(n.id)!),
    edges,
    width,
    height,
  };
}
